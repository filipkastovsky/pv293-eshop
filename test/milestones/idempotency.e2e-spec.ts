import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from '../support/app';

// Team B, Inventory and Fulfilment. Events can arrive more than once (Payment's
// outbox delivers at least once), so a duplicate must not change anything.
// Black-box: events in (dev emit), timeline and HTTP responses out.

/** Long enough for an in-process reaction to a duplicate to have run. */
const settle = () => new Promise((r) => setTimeout(r, 500));

describe('Idempotency: duplicate events change nothing', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  const count = (names: string[], name: string) =>
    names.filter((n) => n === name).length;

  it('OrderPlaced emitted twice reserves stock once', async () => {
    const orderId = randomUUID();
    await t.http().post('/inventory/BEER-01/receive').send({ quantity: 5 });
    const placed = {
      orderId,
      customerEmail: 'a@b.cz',
      lines: [{ sku: 'BEER-01', quantity: 2, unitPrice: 2.9 }],
      total: 5.8,
    };
    await t.emit('OrderPlaced', placed);
    await t.emit('OrderPlaced', placed);
    // The reaction may land before or after the duplicate: wait for both.
    await t.waitForTimeline(orderId, ['OrderPlaced', 'OrderPlaced']);
    await t.waitForTimeline(orderId, ['OrderPlaced', 'StockReserved']);
    await settle();

    const names = (await t.timeline(orderId)).map((e) => e.name);
    expect(count(names, 'StockReserved')).toBe(1);
    expect(names).not.toContain('StockReservationFailed');
    const stock = (await t.http().get('/inventory')).body.find(
      (s: { sku: string }) => s.sku === 'BEER-01',
    );
    expect(stock).toEqual({ sku: 'BEER-01', onHand: 5, reserved: 2 });
  });

  it('OrderPaid emitted twice creates one shipment', async () => {
    const orderId = randomUUID();
    await t.emit('OrderPaid', { orderId });
    await t.emit('OrderPaid', { orderId });
    await t.waitForTimeline(orderId, ['OrderPaid', 'OrderPaid']);
    const entries = await t.waitForTimeline(orderId, [
      'OrderPaid',
      'OrderPacked',
    ]);
    await settle();

    const names = (await t.timeline(orderId)).map((e) => e.name);
    expect(count(names, 'OrderPacked')).toBe(1);
    const packed = entries.find((e) => e.name === 'OrderPacked');
    const res = await t.http().get(`/shipments/${orderId}`).expect(200);
    expect(res.body.shipmentId).toBe(packed?.payload.shipmentId);
  });
});
