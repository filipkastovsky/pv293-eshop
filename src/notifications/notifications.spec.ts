import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createTestDb, TestDb } from '../../test/setup-db';
import {
  CancellationNoticeSent,
  OrderCancelled,
  OrderPlaced,
  OrderSummarySent,
} from '../contracts';
import { ChaosService, PlatformModule } from '../platform';
import { NotificationsModule } from './notifications.module';

const until = async <T>(fn: () => T | undefined, ms = 3000): Promise<T> => {
  const end = Date.now() + ms;
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
};

describe('notifications', () => {
  let db: TestDb;
  let app: INestApplication;
  let bus: EventBus;
  let published: object[];

  const placed = (orderId: string, customerEmail = 'ann@example.com') =>
    new OrderPlaced({
      orderId,
      customerEmail,
      lines: [{ sku: 'MUG-01', quantity: 1, unitPrice: 5 }],
      total: 5,
    });
  const sentFor = (type: unknown, orderId: string) =>
    published.find(
      (e) =>
        e instanceof (type as never) &&
        (e as { orderId: string }).orderId === orderId,
    );
  const messages = async (orderId: string) =>
    (
      await request(app.getHttpServer()).get('/notifications').expect(200)
    ).body.filter((m: { orderId: string }) => m.orderId === orderId);

  beforeAll(async () => {
    db = await createTestDb();
    process.env.DATABASE_URL = db.url;
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule.register(), NotificationsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    bus = app.get(EventBus);
    published = [];
    bus.subscribe((e) => published.push(e));
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it('OrderPlaced leads to OrderSummarySent and a stored message to customerEmail', async () => {
    const id = randomUUID();
    bus.publish(placed(id));
    await until(() => sentFor(OrderSummarySent, id));
    const [m] = await messages(id);
    expect(m.to).toBe('ann@example.com');
    expect(m.subject).toContain(id);
  });

  it('OrderCancelled leads to CancellationNoticeSent, addressed to the customer we know', async () => {
    const id = randomUUID();
    bus.publish(placed(id, 'bob@example.com'));
    await until(() => sentFor(OrderSummarySent, id));
    bus.publish(new OrderCancelled({ orderId: id, reason: 'out of stock' }));
    await until(() => sentFor(CancellationNoticeSent, id));
    const notice = (await messages(id)).find(
      (m: { kind: string }) => m.kind === 'cancellation_notice',
    );
    expect(notice.to).toBe('bob@example.com');
    expect(notice.body).toContain('out of stock');
  });

  it('OrderCancelled for an unknown order stores the notice with no recipient', async () => {
    const id = randomUUID();
    bus.publish(new OrderCancelled({ orderId: id, reason: 'x' }));
    await until(() => sentFor(CancellationNoticeSent, id));
    expect((await messages(id))[0].to).toBeNull();
  });

  it('GET /notifications lists newest first', async () => {
    const a = randomUUID();
    const b = randomUUID();
    bus.publish(placed(a));
    await until(() => sentFor(OrderSummarySent, a));
    bus.publish(placed(b));
    await until(() => sentFor(OrderSummarySent, b));
    const { body } = await request(app.getHttpServer()).get('/notifications');
    const ids = body.map((m: { orderId: string }) => m.orderId);
    expect(ids.indexOf(b)).toBeLessThan(ids.indexOf(a));
  });

  it('armed chaos on SendOrderSummaryPolicy stores nothing and the app stays healthy', async () => {
    const id = randomUUID();
    app.get(ChaosService).arm('SendOrderSummaryPolicy');
    bus.publish(placed(id));
    await new Promise((r) => setTimeout(r, 300));
    expect(await messages(id)).toHaveLength(0);
    expect(sentFor(OrderSummarySent, id)).toBeUndefined();
    const next = randomUUID();
    bus.publish(placed(next));
    await until(() => sentFor(OrderSummarySent, next));
  });
});
