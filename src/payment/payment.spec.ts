import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import {
  EventBus,
  EventsHandler,
  IEventHandler,
  IQueryHandler,
  QueryHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { trace } from '@opentelemetry/api';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import request from 'supertest';
import { createTestDb, TestDb } from '../../test/setup-db';
import { resetTelemetry, spans } from '../../test/support/telemetry';
import {
  DomainEvent,
  GetOrderSummary,
  OrderSummary,
  PaymentFailed,
  PaymentInitiated,
  PaymentSucceeded,
} from '../contracts';
import { DB, PlatformModule } from '../platform';
import { PaymentRepository } from './application/payment.repository';
import { Payment } from './domain/payment';
import { OutboxRepository } from './outbox/outbox.repository';
import { PaymentModule } from './payment.module';

const orders = new Map<string, OrderSummary>();

/** Stands in for Checkout, which answers GetOrderSummary in the real app. */
@QueryHandler(GetOrderSummary)
class StubOrderSummaryHandler implements IQueryHandler<GetOrderSummary> {
  async execute(query: GetOrderSummary): Promise<OrderSummary | null> {
    return orders.get(query.orderId) ?? null;
  }
}

/** A subscriber, so the relay's publish has handler spans below it. */
@EventsHandler(PaymentSucceeded)
class SucceededSubscriber implements IEventHandler<PaymentSucceeded> {
  handle(): void {}
}

const order = (
  status: OrderSummary['status'],
  total: number,
): OrderSummary => ({
  orderId: randomUUID(),
  status,
  customerEmail: 'a@b.cz',
  lines: [],
  total,
});

const until = async (check: () => Promise<boolean> | boolean) => {
  for (let i = 0; i < 100; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error('condition not met in time');
};

describe('payment', () => {
  let db: TestDb;
  let app: INestApplication;
  let published: DomainEvent[];

  const boot = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule.register(), PaymentModule],
      providers: [StubOrderSummaryHandler, SucceededSubscriber],
    }).compile();
    const a = moduleRef.createNestApplication();
    await a.init();
    published = [];
    a.get(EventBus).subscribe((e) => published.push(e as DomainEvent));
    return a;
  };
  const pay = (orderId: string) =>
    request(app.getHttpServer()).post(`/orders/${orderId}/pay`);
  const count = async (table: string) =>
    Number(
      (await db.pool.query(`SELECT count(*) FROM payment.${table}`)).rows[0]
        .count,
    );
  const insertOutbox = (
    eventName: string,
    payload: object,
    createdAt: string,
  ) =>
    db.pool.query(
      'INSERT INTO payment.outbox (event_name, payload, created_at) VALUES ($1, $2, $3)',
      [eventName, JSON.stringify(payload), createdAt],
    );

  beforeAll(async () => {
    db = await createTestDb();
    process.env.DATABASE_URL = db.url;
    app = await boot();
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it('pay for a placed order publishes PaymentInitiated then PaymentSucceeded', async () => {
    const o = order('placed', 24.5);
    orders.set(o.orderId, o);
    await pay(o.orderId).expect(202);
    await until(() => published.length === 2);
    expect(published[0]).toBeInstanceOf(PaymentInitiated);
    expect(published[1]).toBeInstanceOf(PaymentSucceeded);
    expect(published[0]).toMatchObject({ orderId: o.orderId, amount: 24.5 });
    expect((published[1] as PaymentSucceeded).paymentId).toBe(
      (published[0] as PaymentInitiated).paymentId,
    );
    const { rows } = await db.pool.query(
      'SELECT status FROM payment.payments WHERE order_id = $1',
      [o.orderId],
    );
    expect(rows).toEqual([{ status: 'succeeded' }]);
  });

  it('amount ending in .13 publishes PaymentFailed', async () => {
    const o = order('placed', 120.13);
    orders.set(o.orderId, o);
    await pay(o.orderId).expect(202);
    await until(() => published.length === 4);
    expect(published[2]).toBeInstanceOf(PaymentInitiated);
    expect(published[3]).toBeInstanceOf(PaymentFailed);
    expect(published[3]).toMatchObject({
      orderId: o.orderId,
      reason: 'declined',
    });
  });

  it('unknown order -> 409', async () => {
    await pay(randomUUID()).expect(409);
  });

  it('order not placed -> 409', async () => {
    const o = order('paid', 10);
    orders.set(o.orderId, o);
    await pay(o.orderId).expect(409);
  });

  it('no GetOrderSummary handler registered -> 409', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule.register(), PaymentModule],
    }).compile();
    const bare = moduleRef.createNestApplication();
    await bare.init();
    await request(bare.getHttpServer())
      .post(`/orders/${randomUUID()}/pay`)
      .expect(409);
    await bare.close();
  });

  it('paying twice -> 202 then 409, one payment', async () => {
    const o = order('placed', 10);
    orders.set(o.orderId, o);
    await pay(o.orderId).expect(202);
    await pay(o.orderId).expect(409);
    const { rows } = await db.pool.query(
      'SELECT 1 FROM payment.payments WHERE order_id = $1',
      [o.orderId],
    );
    expect(rows).toHaveLength(1);
  });

  it('a retry after a decline is allowed', async () => {
    const o = order('placed', 50.13);
    orders.set(o.orderId, o);
    await pay(o.orderId).expect(202);
    await pay(o.orderId).expect(202);
  });

  it('event row is written in the same transaction as the payment (roll back the transaction -> no outbox row)', async () => {
    const repo = app.get(PaymentRepository);
    const outboxRepo = app.get(OutboxRepository);
    const realAdd = outboxRepo.add.bind(outboxRepo);
    // The row really is written; the failure comes after it, so it must roll back.
    const spy = jest
      .spyOn(outboxRepo, 'add')
      .mockImplementationOnce(async (tx, e) => {
        await realAdd(tx, e);
        throw new Error('boom');
      });
    const before = {
      payments: await count('payments'),
      outbox: await count('outbox'),
    };
    const payment = Payment.initiate(randomUUID(), 'rollback-order', 5);
    const event = new PaymentInitiated({
      orderId: 'rollback-order',
      paymentId: payment.id,
      amount: 5,
    });
    await expect(repo.saveInitiated(payment, event)).rejects.toThrow('boom');
    spy.mockRestore();
    expect(await count('payments')).toBe(before.payments);
    expect(await count('outbox')).toBe(before.outbox);
  });

  it('relay publishes rows written while the app was down', async () => {
    await app.close();
    const orderId = randomUUID();
    await insertOutbox(
      'PaymentSucceeded',
      { orderId, paymentId: randomUUID() },
      '2020-01-01T00:00:00Z',
    );
    app = await boot();
    await until(() => published.length === 1);
    expect(published[0]).toBeInstanceOf(PaymentSucceeded);
    expect(published[0]).toMatchObject({ orderId });
    const { rows } = await db.pool.query(
      `SELECT published_at FROM payment.outbox WHERE payload->>'orderId' = $1`,
      [orderId],
    );
    expect(rows[0].published_at).not.toBeNull();
  });

  it('relay publishes in created_at order', async () => {
    const first = randomUUID();
    const second = randomUUID();
    // Inserted newest first: only created_at says which is older.
    await insertOutbox(
      'PaymentSucceeded',
      { orderId: second, paymentId: randomUUID() },
      '2021-01-02T00:00:00Z',
    );
    await insertOutbox(
      'PaymentSucceeded',
      { orderId: first, paymentId: randomUUID() },
      '2021-01-01T00:00:00Z',
    );
    await until(() => published.length === 3);
    expect(
      published.slice(1).map((e) => (e as PaymentSucceeded).orderId),
    ).toEqual([first, second]);
  });

  describe('trace context', () => {
    const relaySpans = () =>
      spans.getFinishedSpans().filter((s) => s.name.startsWith('outbox.relay'));
    const waitForRelay = (n: number) => until(() => relaySpans().length >= n);
    const event = (orderId: string) =>
      new PaymentSucceeded({ orderId, paymentId: randomUUID() });
    const addInSpan = async (e: PaymentSucceeded) => {
      const outboxRepo = app.get(OutboxRepository);
      return trace
        .getTracer('test')
        .startActiveSpan('request', async (span) => {
          try {
            await app
              .get<NodePgDatabase>(DB)
              .transaction((tx) => outboxRepo.add(tx, e));
            return span.spanContext();
          } finally {
            span.end();
          }
        });
    };

    beforeEach(() => resetTelemetry());

    it('add() inside an active span stores traceparent of that span', async () => {
      const e = event(randomUUID());
      const ctx = await addInSpan(e);
      const { rows } = await db.pool.query(
        `SELECT trace_context FROM payment.outbox WHERE payload->>'orderId' = $1`,
        [e.orderId],
      );
      expect(rows[0].trace_context.traceparent).toMatch(
        new RegExp(`^00-${ctx.traceId}-${ctx.spanId}-0[01]$`),
      );
    });

    it('add() with no active span stores NULL', async () => {
      const e = event(randomUUID());
      await app
        .get<NodePgDatabase>(DB)
        .transaction((tx) => app.get(OutboxRepository).add(tx, e));
      const { rows } = await db.pool.query(
        `SELECT trace_context FROM payment.outbox WHERE payload->>'orderId' = $1`,
        [e.orderId],
      );
      expect(rows[0].trace_context).toBeNull();
    });

    it('relay publishes each row as root span "outbox.relay <EventName>" with one link to the stored context; handler spans are its descendants', async () => {
      const ctx = await addInSpan(event(randomUUID()));
      await until(() =>
        relaySpans().some((s) => s.links[0]?.context.traceId === ctx.traceId),
      );
      const relay = relaySpans().find(
        (s) => s.links[0]?.context.traceId === ctx.traceId,
      );
      if (!relay) throw new Error('relay span missing');
      expect(relay.name).toBe('outbox.relay PaymentSucceeded');
      expect(relay.parentSpanContext).toBeUndefined();
      expect(relay.spanContext().traceId).not.toBe(ctx.traceId);
      expect(relay.links).toHaveLength(1);
      expect(relay.links[0].context).toMatchObject({
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      });
      const mine = spans
        .getFinishedSpans()
        .filter((s) => s.spanContext().traceId === relay.spanContext().traceId);
      const publish = mine.find((s) => s.name === 'publish PaymentSucceeded');
      expect(publish?.parentSpanContext?.spanId).toBe(
        relay.spanContext().spanId,
      );
      const handler = mine.find((s) => s.name === 'process PaymentSucceeded');
      expect(handler?.parentSpanContext?.spanId).toBe(
        publish?.spanContext().spanId,
      );
      expect(handler?.spanContext().traceId).toBe(relay.spanContext().traceId);
    });

    it('row with trace_context NULL -> published, span has zero links', async () => {
      const orderId = randomUUID();
      await insertOutbox(
        'PaymentSucceeded',
        { orderId, paymentId: randomUUID() },
        '2022-01-01T00:00:00Z',
      );
      await waitForRelay(1);
      expect(relaySpans()[0].links).toHaveLength(0);
      expect(
        published.some((e) => (e as PaymentSucceeded).orderId === orderId),
      ).toBe(true);
    });

    it('row with trace_context {"traceparent":"garbage"} -> published, zero links, next row still published', async () => {
      const bad = randomUUID();
      const next = randomUUID();
      await db.pool.query(
        `INSERT INTO payment.outbox (event_name, payload, trace_context, created_at) VALUES ($1, $2, $3, $4)`,
        [
          'PaymentSucceeded',
          JSON.stringify({ orderId: bad, paymentId: randomUUID() }),
          JSON.stringify({ traceparent: 'garbage' }),
          '2023-01-01T00:00:00Z',
        ],
      );
      await db.pool.query(
        `INSERT INTO payment.outbox (event_name, payload, trace_context, created_at) VALUES ($1, $2, $3, $4)`,
        [
          'PaymentSucceeded',
          JSON.stringify({ orderId: next, paymentId: randomUUID() }),
          JSON.stringify(['not', 'an', 'object']),
          '2023-01-02T00:00:00Z',
        ],
      );
      await waitForRelay(2);
      expect(relaySpans().map((s) => s.links.length)).toEqual([0, 0]);
      const ids = published.map((e) => (e as PaymentSucceeded).orderId);
      expect(ids).toEqual(expect.arrayContaining([bad, next]));
    });
  });
});
