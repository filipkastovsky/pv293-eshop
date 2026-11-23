import { CheckoutRuleViolation } from './checkout-rule-violation';
import { Order, OrderHistoryEvent } from './order';

const lines = [
  { sku: 'BEER-01', quantity: 2, unitPrice: 2.9 },
  { sku: 'MAT-01', quantity: 1, unitPrice: 24.5 },
];
const created: OrderHistoryEvent = {
  type: 'OrderCreated',
  orderId: 'o-1',
  cartId: 'c-1',
  customerEmail: 'a@b.cz',
  lines,
};
const placed: OrderHistoryEvent = {
  type: 'OrderPlaced',
  orderId: 'o-1',
  customerEmail: 'a@b.cz',
  lines,
  total: 30.3,
};
const types = (order: Order) => order.pendingEvents.map((e) => e.type);

describe('Order', () => {
  it('is created from a checked-out cart, total in exact cents', () => {
    const order = Order.create({
      orderId: 'o-1',
      cartId: 'c-1',
      customerEmail: 'a@b.cz',
      lines,
    });
    expect(types(order)).toEqual(['OrderCreated']);
    expect(order.version).toBe(0);
    expect(order.snapshot()).toEqual({
      orderId: 'o-1',
      status: 'created',
      customerEmail: 'a@b.cz',
      lines,
      total: 30.3,
    });
  });

  it('refuses an order without lines', () => {
    expect(() =>
      Order.create({
        orderId: 'o-1',
        cartId: 'c-1',
        customerEmail: 'a@b.cz',
        lines: [],
      }),
    ).toThrow(CheckoutRuleViolation);
  });

  it('rebuilds its state from history and appends after it', () => {
    const order = Order.fromHistory('o-1', [created, placed]);
    expect(order.currentStatus).toBe('placed');
    expect(order.version).toBe(2);
    expect(order.pendingEvents).toEqual([]);
  });

  it('refuses a history that does not start with OrderCreated', () => {
    expect(() => Order.fromHistory('o-1', [placed])).toThrow();
  });

  it('created -> placed carries the data subscribers need', () => {
    const order = Order.fromHistory('o-1', [created]);
    order.place();
    expect(order.pendingEvents).toEqual([placed]);
  });

  it('placed -> paid', () => {
    const order = Order.fromHistory('o-1', [created, placed]);
    order.markPaid('pay-1');
    expect(types(order)).toEqual(['OrderPaid']);
    expect(order.snapshot().status).toBe('paid');
  });

  it('cannot be paid before it is placed', () => {
    const order = Order.fromHistory('o-1', [created]);
    expect(() => order.markPaid('pay-1')).toThrow(CheckoutRuleViolation);
  });

  it('placed -> cancelled, and cancelled is final', () => {
    const order = Order.fromHistory('o-1', [created, placed]);
    order.cancel('out of stock: BEER-01');
    expect(types(order)).toEqual(['OrderCancelled']);
    expect(() => order.place()).toThrow(CheckoutRuleViolation);
    expect(() => order.markPaid('pay-1')).toThrow(CheckoutRuleViolation);
  });

  it('a paid order cannot be cancelled', () => {
    const order = Order.fromHistory('o-1', [
      created,
      placed,
      { type: 'OrderPaid', orderId: 'o-1', paymentId: 'pay-1' },
    ]);
    expect(() => order.cancel('late')).toThrow(CheckoutRuleViolation);
  });

  it('repeating what already happened records nothing (duplicate deliveries)', () => {
    const order = Order.fromHistory('o-1', [
      created,
      placed,
      { type: 'OrderPaid', orderId: 'o-1', paymentId: 'pay-1' },
    ]);
    order.markPaid('pay-1');
    expect(order.pendingEvents).toEqual([]);

    const cancelled = Order.fromHistory('o-2', [
      { ...created, orderId: 'o-2' },
      { type: 'OrderCancelled', orderId: 'o-2', reason: 'x' },
    ]);
    cancelled.cancel('again');
    expect(cancelled.pendingEvents).toEqual([]);

    const placedTwice = Order.fromHistory('o-1', [created, placed]);
    placedTwice.place();
    expect(placedTwice.pendingEvents).toEqual([]);
  });
});
