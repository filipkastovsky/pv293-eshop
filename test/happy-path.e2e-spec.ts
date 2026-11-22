import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from './support/app';

// Un-skip when checkout, inventory and fulfilment all work together.
describe.skip('happy path: from cart to packed order', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  it('cart -> checkout -> place -> pay ends with OrderPacked', async () => {
    await t.http().post('/inventory/BEER-01/receive').send({ quantity: 10 });

    const cartId = randomUUID();
    await t
      .http()
      .post(`/carts/${cartId}/items`)
      .send({ sku: 'BEER-01', quantity: 2 })
      .expect(201);
    const orderId = (
      await t
        .http()
        .post(`/carts/${cartId}/checkout`)
        .send({ customerEmail: 'a@b.cz' })
        .expect(201)
    ).body.orderId as string;
    await t.http().post(`/orders/${orderId}/place`).expect(202);

    // StockReserved and OrderSummarySent both react to OrderPlaced and may
    // arrive in either order, so wait for both before paying.
    await t.waitForTimeline(orderId, ['OrderCreated', 'OrderPlaced']);
    await t.waitForTimeline(orderId, ['OrderPlaced', 'StockReserved']);
    await t.waitForTimeline(orderId, ['OrderPlaced', 'OrderSummarySent']);

    await t.http().post(`/orders/${orderId}/pay`).expect(202);
    const entries = await t.waitForTimeline(
      orderId,
      [
        'OrderCreated',
        'OrderPlaced',
        'PaymentInitiated',
        'PaymentSucceeded',
        'OrderPaid',
        'OrderPacked',
      ],
      20_000,
    );
    const names = entries.map((e) => e.name);
    const afterPlaced = names.indexOf('OrderPlaced');
    const initiated = names.indexOf('PaymentInitiated');
    for (const n of ['StockReserved', 'OrderSummarySent']) {
      expect(names.indexOf(n)).toBeGreaterThan(afterPlaced);
      expect(names.indexOf(n)).toBeLessThan(initiated);
    }
  });
});
