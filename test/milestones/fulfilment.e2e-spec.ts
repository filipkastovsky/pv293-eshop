import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from '../support/app';

// Team B, Fulfilment. Un-skip the milestone when you start it.
// Fulfilment has no command of its own, so its first milestone is M3.
// Black-box: HTTP routes in, events (timeline) and HTTP responses out.

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
