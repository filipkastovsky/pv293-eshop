import { randomUUID } from 'node:crypto';
import { bootTestApp, TestApp } from './support/app';

describe('Checkout consistency', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp();
  });
  afterAll(() => t.close());

  it('keeps the cart editable after a failed checkout and creates one order on concurrent retries', async () => {
    const cartId = randomUUID();
    const add = (quantity: number) =>
      t
        .http()
        .post(`/carts/${cartId}/items`)
        .send({ sku: 'BEER-01', quantity });
    const checkOut = () =>
      t
        .http()
        .post(`/carts/${cartId}/checkout`)
        .send({ customerEmail: 'a@b.cz' });

    await add(1).expect(201);
    await t
      .http()
      .post('/dev/chaos')
      .send({ handler: 'CreateOrderPolicy' })
      .expect(202);
    await checkOut().expect(500);
    await add(2).expect(201);

    const [first, second] = await Promise.all([
      checkOut().expect(201),
      checkOut().expect(201),
    ]);
    const { orderId } = first.body;
    expect(second.body).toEqual({ orderId });
    await add(1).expect(409);

    const res = await t.http().get(`/orders/${orderId}`).expect(200);
    expect(res.body).toMatchObject({
      status: 'created',
      lines: [{ sku: 'BEER-01', quantity: 3, unitPrice: 2.9 }],
      total: 8.7,
    });

    // A real Inventory can reserve the order when this suite runs after M4.
    await t.http().post('/inventory/BEER-01/receive').send({ quantity: 3 });
    await t.http().post(`/orders/${orderId}/place`).expect(202);
    const timeline = await t.waitForTimeline(orderId, [
      'OrderCreated',
      'OrderPlaced',
    ]);
    expect(timeline.filter(({ name }) => name === 'OrderCreated')).toHaveLength(
      1,
    );
  });
});
