import { INestApplication, Injectable } from '@nestjs/common';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { OrderPlaced } from '../src/contracts';
import { HealthController } from '../src/health.controller';
import { ChaosService, PlatformModule } from '../src/platform';
import { createTestDb, TestDb } from './setup-db';

@Injectable()
@EventsHandler(OrderPlaced)
class TestPolicy implements IEventHandler {
  constructor(private readonly chaos: ChaosService) {}
  handle(): void {
    this.chaos.maybeFail('TestPolicy');
  }
}

const placed = (orderId: string) => ({
  orderId,
  customerEmail: 'a@b.cz',
  lines: [{ sku: 'X', quantity: 1, unitPrice: 10 }],
  total: 10,
});

// DEV_ENDPOINTS is read when PlatformModule.register() is called.
async function bootApp(devEndpoints: boolean) {
  if (devEndpoints) process.env.DEV_ENDPOINTS = 'true';
  else delete process.env.DEV_ENDPOINTS;
  const moduleRef = await Test.createTestingModule({
    imports: [PlatformModule.register()],
    controllers: [HealthController],
    providers: [TestPolicy],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

async function eventually<T>(fn: () => Promise<T>, ok: (v: T) => boolean) {
  let v = await fn();
  for (let i = 0; i < 50 && !ok(v); i++) {
    await new Promise((r) => setTimeout(r, 50));
    v = await fn();
  }
  return v;
}

describe('platform (dev endpoints on)', () => {
  let db: TestDb;
  let app: INestApplication;
  const timeline = async (id: string) =>
    (await request(app.getHttpServer()).get(`/orders/${id}/timeline`)).body;

  beforeAll(async () => {
    db = await createTestDb();
    process.env.DATABASE_URL = db.url;
    app = await bootApp(true);
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
    delete process.env.DEV_ENDPOINTS;
  });

  it('emitted order event appears in timeline', async () => {
    await request(app.getHttpServer())
      .post('/dev/emit/OrderPlaced')
      .send(placed('o-1'))
      .expect(202);
    const body = await eventually(
      () => timeline('o-1'),
      (b) => b.entries.length > 0,
    );
    expect(body.orderId).toBe('o-1');
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]).toMatchObject({
      kind: 'event',
      name: 'OrderPlaced',
    });
    expect(body.entries[0].payload.orderId).toBe('o-1');
  });

  it('chaos makes the next handler fail and timeline shows handler_failed', async () => {
    await request(app.getHttpServer())
      .post('/dev/chaos')
      .send({ handler: 'TestPolicy' })
      .expect(202);
    await request(app.getHttpServer())
      .post('/dev/emit/OrderPlaced')
      .send(placed('o-2'))
      .expect(202);
    const body = await eventually(
      () => timeline('o-2'),
      (b) => b.entries.length >= 2,
    );
    const failed = body.entries.find(
      (e: { kind: string }) => e.kind === 'handler_failed',
    );
    expect(failed).toMatchObject({ name: 'TestPolicy' });
    expect(failed.payload.event).toBe('OrderPlaced');
    expect(failed.payload.error).toMatch(/TestPolicy/);
    await request(app.getHttpServer()).get('/health').expect(200);

    // consumed: the next one succeeds
    await request(app.getHttpServer())
      .post('/dev/emit/OrderPlaced')
      .send(placed('o-3'))
      .expect(202);
    const b3 = await eventually(
      () => timeline('o-3'),
      (b) => b.entries.length >= 1,
    );
    await new Promise((r) => setTimeout(r, 200));
    expect((await timeline('o-3')).entries).toHaveLength(1);
    expect(b3.entries[0].kind).toBe('event');
  });

  it('unknown event name -> 400 and nothing recorded', async () => {
    await request(app.getHttpServer())
      .post('/dev/emit/Nope')
      .send({ orderId: 'o-4' })
      .expect(400);
    expect((await timeline('o-4')).entries).toEqual([]);
  });

  it('payload without orderId -> 400', async () => {
    await request(app.getHttpServer())
      .post('/dev/emit/OrderPlaced')
      .send({ customerEmail: 'a@b.cz' })
      .expect(400);
  });
});

describe('platform (dev endpoints off)', () => {
  let db: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    db = await createTestDb();
    process.env.DATABASE_URL = db.url;
    app = await bootApp(false);
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it('/dev/* is 404 when DEV_ENDPOINTS is unset', async () => {
    await request(app.getHttpServer())
      .post('/dev/emit/OrderPlaced')
      .send({})
      .expect(404);
    await request(app.getHttpServer())
      .post('/dev/chaos')
      .send({ handler: 'x' })
      .expect(404);
  });
});
