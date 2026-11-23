import { Cart } from './cart';
import { CheckoutRuleViolation } from './checkout-rule-violation';

const quote = (unitPrice: number, available = true) => ({
  unitPrice,
  available,
});

describe('Cart', () => {
  it('adds to the quantity of a sku already in the cart', () => {
    const cart = Cart.open('c-1');
    cart.add('BEER-01', 2);
    cart.add('BEER-01', 1);
    expect(cart.contents).toEqual([{ sku: 'BEER-01', quantity: 3 }]);
  });

  it('refuses a quantity that is not a positive integer', () => {
    const cart = Cart.open('c-1');
    expect(() => cart.add('BEER-01', 0)).toThrow(CheckoutRuleViolation);
    expect(() => cart.add('BEER-01', 1.5)).toThrow(CheckoutRuleViolation);
  });

  it('removes a sku; removing one that is not there says so', () => {
    const cart = Cart.restore('c-1', [{ sku: 'BEER-01', quantity: 2 }], null);
    expect(cart.remove('MAT-01')).toBe(false);
    expect(cart.remove('BEER-01')).toBe(true);
    expect(cart.contents).toEqual([]);
  });

  it('checks out at the quoted prices and binds the order id', () => {
    const cart = Cart.restore('c-1', [{ sku: 'BEER-01', quantity: 2 }], null);
    const lines = cart.checkOut('o-1', new Map([['BEER-01', quote(2.9)]]));
    expect(lines).toEqual([{ sku: 'BEER-01', quantity: 2, unitPrice: 2.9 }]);
    expect(cart.orderId).toBe('o-1');
  });

  it('cannot check out empty, or with an unavailable or unknown product', () => {
    expect(() => Cart.open('c-1').checkOut('o-1', new Map())).toThrow(
      CheckoutRuleViolation,
    );
    const cart = Cart.restore('c-1', [{ sku: 'BEER-01', quantity: 1 }], null);
    expect(() =>
      cart.checkOut('o-1', new Map([['BEER-01', quote(2.9, false)]])),
    ).toThrow(CheckoutRuleViolation);
    expect(() => cart.checkOut('o-1', new Map())).toThrow(
      CheckoutRuleViolation,
    );
    expect(cart.orderId).toBeNull();
  });

  it('cannot change once checked out', () => {
    const cart = Cart.restore('c-1', [{ sku: 'BEER-01', quantity: 1 }], 'o-1');
    expect(() => cart.add('MAT-01', 1)).toThrow(CheckoutRuleViolation);
    expect(() => cart.remove('BEER-01')).toThrow(CheckoutRuleViolation);
    expect(() => cart.checkOut('o-2', new Map())).toThrow(
      CheckoutRuleViolation,
    );
  });
});
