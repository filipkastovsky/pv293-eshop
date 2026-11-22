import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from '../support/app';

// Team A, Checkout. Un-skip a milestone when you start it.
// Black-box: HTTP routes in, events (timeline) and HTTP responses out.
// Seed prices (Catalog): BEER-01 2.90, MAT-01 24.50.

describe.skip('Checkout M2: cart, checkout and placing through its own routes', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  const addItem = (cartId: string, sku: string, quantity: number) =>
    t.http().post(`/carts/${cartId}/items`).send({ sku, quantity });
  const checkout = async (cartId: string) =>
    (
      await t
        .http()
        .post(`/carts/${cartId}/checkout`)
        .send({ customerEmail: 'a@b.cz' })
        .expect(201)
    ).body.orderId as string;

  it('checkout creates an order: OrderCreated and status created', async () => {
    const cartId = randomUUID();
    await addItem(cartId, 'BEER-01', 2).expect(201);
    const orderId = await checkout(cartId);
    expect(orderId).toEqual(expect.any(String));

    await t.waitForTimeline(orderId, ['OrderCreated']);
    const res = await t.http().get(`/orders/${orderId}`).expect(200);
    expect(res.body).toEqual({
      orderId,
      status: 'created',
      customerEmail: 'a@b.cz',
      lines: [{ sku: 'BEER-01', quantity: 2, unitPrice: 2.9 }],
      total: 5.8,
    });
  });

  it('a removed item is not part of the order', async () => {
    const cartId = randomUUID();
    await addItem(cartId, 'BEER-01', 2).expect(201);
    await addItem(cartId, 'MAT-01', 1).expect(201);
    await t.http().delete(`/carts/${cartId}/items/BEER-01`);
    const orderId = await checkout(cartId);
    await t.waitForTimeline(orderId, ['OrderCreated']);
    const res = await t.http().get(`/orders/${orderId}`).expect(200);
    expect(res.body.lines).toEqual([
      { sku: 'MAT-01', quantity: 1, unitPrice: 24.5 },
    ]);
    expect(res.body.total).toBe(24.5);
  });

  it('placing the order emits OrderPlaced and the status becomes placed', async () => {
    const cartId = randomUUID();
    await addItem(cartId, 'BEER-01', 1).expect(201);
    const orderId = await checkout(cartId);
    await t.http().post(`/orders/${orderId}/place`).expect(202);
    const entries = await t.waitForTimeline(orderId, [
      'OrderCreated',
      'OrderPlaced',
    ]);
    expect(
      entries.find((e) => e.name === 'OrderPlaced')?.payload,
    ).toMatchObject({
      orderId,
      customerEmail: 'a@b.cz',
      lines: [{ sku: 'BEER-01', quantity: 1, unitPrice: 2.9 }],
      total: 2.9,
    });
    const res = await t.http().get(`/orders/${orderId}`).expect(200);
    expect(res.body.status).toBe('placed');
  });

  it('unknown order -> 404', async () => {
    await t.http().get(`/orders/${randomUUID()}`).expect(404);
  });
});

describe.skip('Checkout M3: reacting to other teams events', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  const placeOrder = async () => {
    const cartId = randomUUID();
    await t
      .http()
      .post(`/carts/${cartId}/items`)
      .send({ sku: 'BEER-01', quantity: 1 })
      .expect(201);
    const orderId = (
      await t
        .http()
        .post(`/carts/${cartId}/checkout`)
        .send({ customerEmail: 'a@b.cz' })
        .expect(201)
    ).body.orderId as string;
    await t.http().post(`/orders/${orderId}/place`).expect(202);
    await t.waitForTimeline(orderId, ['OrderCreated', 'OrderPlaced']);
    return orderId;
  };
  const status = async (orderId: string) =>
    (await t.http().get(`/orders/${orderId}`)).body.status;

  it('StockReserved then PaymentSucceeded -> OrderPaid, status paid', async () => {
    const orderId = await placeOrder();
    await t.emit('StockReserved', { orderId });
    await t.emit('PaymentSucceeded', { orderId, paymentId: 'pay-1' });
    await t.waitForTimeline(orderId, [
      'OrderPlaced',
      'StockReserved',
      'PaymentSucceeded',
      'OrderPaid',
    ]);
    expect(await status(orderId)).toBe('paid');
  });

  it('StockReservationFailed -> OrderCancelled, status cancelled', async () => {
    const orderId = await placeOrder();
    await t.emit('StockReservationFailed', { orderId, sku: 'BEER-01' });
    const entries = await t.waitForTimeline(orderId, [
      'OrderPlaced',
      'StockReservationFailed',
      'OrderCancelled',
    ]);
    expect(
      entries.find((e) => e.name === 'OrderCancelled')?.payload,
    ).toMatchObject({ orderId, reason: expect.any(String) });
    expect(await status(orderId)).toBe('cancelled');
  });
});
