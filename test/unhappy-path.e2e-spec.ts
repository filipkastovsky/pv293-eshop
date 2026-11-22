import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from './support/app';

// Un-skip when checkout, inventory and fulfilment all work together.
describe.skip('unhappy paths', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  const placeOrder = async (sku: string, quantity: number) => {
    const cartId = randomUUID();
    await t
      .http()
      .post(`/carts/${cartId}/items`)
      .send({ sku, quantity })
      .expect(201);
    const orderId = (
      await t
        .http()
        .post(`/carts/${cartId}/checkout`)
        .send({ customerEmail: 'a@b.cz' })
        .expect(201)
    ).body.orderId as string;
    await t.waitForTimeline(orderId, ['OrderCreated']);
    await t.http().post(`/orders/${orderId}/place`).expect(202);
    return orderId;
  };

  it('out of stock -> StockReservationFailed, OrderCancelled, CancellationNoticeSent', async () => {
    await t.http().post('/inventory/MAT-01/receive').send({ quantity: 1 });
    const orderId = await placeOrder('MAT-01', 3);
    await t.waitForTimeline(orderId, [
      'OrderPlaced',
      'StockReservationFailed',
      'OrderCancelled',
      'CancellationNoticeSent',
    ]);
    const res = await t.http().get(`/orders/${orderId}`).expect(200);
    expect(res.body.status).toBe('cancelled');
  });

  it('declined payment (HOODIE-01, 120.13) -> PaymentFailed, order stays placed', async () => {
    await t.http().post('/inventory/HOODIE-01/receive').send({ quantity: 5 });
    const orderId = await placeOrder('HOODIE-01', 1);
    await t.waitForTimeline(orderId, ['OrderPlaced', 'StockReserved']);
    await t.http().post(`/orders/${orderId}/pay`).expect(202);
    const entries = await t.waitForTimeline(
      orderId,
      ['PaymentInitiated', 'PaymentFailed'],
      20_000,
    );
    expect(
      entries.find((e) => e.name === 'PaymentFailed')?.payload,
    ).toMatchObject({ orderId, reason: 'declined' });
    const res = await t.http().get(`/orders/${orderId}`).expect(200);
    expect(res.body.status).toBe('placed');
  });
});
