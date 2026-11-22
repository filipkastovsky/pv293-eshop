import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from '../support/app';

// Team B, Fulfilment. Un-skip a milestone when you start it.
// Black-box: HTTP routes in, events (timeline) and HTTP responses out.

describe.skip('Fulfilment M2: shipments are readable through its own route', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  it('an order that was never paid has no shipment (404)', async () => {
    await t.http().get(`/shipments/${randomUUID()}`).expect(404);
  });
});

describe.skip('Fulfilment M3: reacting to OrderPaid', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  it('OrderPaid -> OrderPacked and a readable shipment', async () => {
    const orderId = randomUUID();
    await t.emit('OrderPaid', { orderId });
    const entries = await t.waitForTimeline(orderId, [
      'OrderPaid',
      'OrderPacked',
    ]);
    const packed = entries.find((e) => e.name === 'OrderPacked');
    expect(packed?.payload).toMatchObject({
      orderId,
      shipmentId: expect.any(String),
    });

    const res = await t.http().get(`/shipments/${orderId}`).expect(200);
    expect(res.body).toEqual({
      orderId,
      shipmentId: packed?.payload.shipmentId,
      status: expect.any(String),
    });
  });
});
