import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from '../support/app';

// Team B, Inventory. Un-skip a milestone when you start it.
// Black-box: HTTP routes in, events (timeline) and HTTP responses out.
// StockReceived is not an order event, so the timeline cannot show it:
// M2 checks the stock levels over HTTP instead.

const placed = (orderId: string, sku: string, quantity: number) => ({
  orderId,
  customerEmail: 'a@b.cz',
  lines: [{ sku, quantity, unitPrice: 4.5 }],
  total: 4.5 * quantity,
});

describe('Inventory M2: receiving stock through its own routes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  const stock = async (sku: string) =>
    (await t.http().get('/inventory')).body.find(
      (s: { sku: string }) => s.sku === sku,
    );

  it('receiving 5 BEER-01 shows onHand 5, reserved 0', async () => {
    const res = await t
      .http()
      .post('/inventory/BEER-01/receive')
      .send({ quantity: 5 });
    expect(res.status).toBeLessThan(300);
    expect(await stock('BEER-01')).toEqual({
      sku: 'BEER-01',
      onHand: 5,
      reserved: 0,
    });
  });

  it('receiving again adds up', async () => {
    await t.http().post('/inventory/MAT-01/receive').send({ quantity: 2 });
    await t.http().post('/inventory/MAT-01/receive').send({ quantity: 3 });
    expect(await stock('MAT-01')).toEqual({
      sku: 'MAT-01',
      onHand: 5,
      reserved: 0,
    });
  });
});

describe('Inventory M3: reacting to OrderPlaced and OrderCancelled', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  const stock = async (sku: string) =>
    (await t.http().get('/inventory')).body.find(
      (s: { sku: string }) => s.sku === sku,
    );
  const receive = (sku: string, quantity: number) =>
    t.http().post(`/inventory/${sku}/receive`).send({ quantity });

  it('OrderPlaced with enough stock -> StockReserved, reserved 2', async () => {
    const orderId = randomUUID();
    await receive('BEER-01', 5);
    await t.emit('OrderPlaced', placed(orderId, 'BEER-01', 2));
    await t.waitForTimeline(orderId, ['OrderPlaced', 'StockReserved']);
    expect(await stock('BEER-01')).toMatchObject({ onHand: 5, reserved: 2 });
  });

  it('OrderPlaced with too little stock -> StockReservationFailed, nothing reserved', async () => {
    const orderId = randomUUID();
    await receive('MUG-01', 1);
    await t.emit('OrderPlaced', placed(orderId, 'MUG-01', 2));
    const entries = await t.waitForTimeline(orderId, [
      'OrderPlaced',
      'StockReservationFailed',
    ]);
    expect(entries.map((e) => e.name)).not.toContain('StockReserved');
    expect(
      entries.find((e) => e.name === 'StockReservationFailed')?.payload,
    ).toMatchObject({ orderId, sku: 'MUG-01' });
    expect(await stock('MUG-01')).toMatchObject({ onHand: 1, reserved: 0 });
  });

  it('OrderCancelled after a reservation -> StockReleased, reserved back to 0', async () => {
    const orderId = randomUUID();
    await receive('CHEESE-01', 5);
    await t.emit('OrderPlaced', placed(orderId, 'CHEESE-01', 2));
    await t.waitForTimeline(orderId, ['OrderPlaced', 'StockReserved']);
    await t.emit('OrderCancelled', { orderId, reason: 'test' });
    await t.waitForTimeline(orderId, [
      'StockReserved',
      'OrderCancelled',
      'StockReleased',
    ]);
    expect(await stock('CHEESE-01')).toMatchObject({ onHand: 5, reserved: 0 });
  });
});
