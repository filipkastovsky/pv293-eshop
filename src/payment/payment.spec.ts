import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { EventBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createTestDb, TestDb } from '../../test/setup-db';
import {
  DomainEvent,
  GetOrderSummary,
  OrderSummary,
  PaymentFailed,
  PaymentInitiated,
  PaymentSucceeded,
} from '../contracts';
import { PlatformModule } from '../platform';
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
      providers: [StubOrderSummaryHandler],
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
});
