import type { OrderLine } from '../../contracts';
import { CheckoutRuleViolation } from './checkout-rule-violation';

/** What the shop asks for a product when the cart is checked out. */
export interface PriceQuote {
  unitPrice: number;
  available: boolean;
}

/**
 * A customer's cart. State-based: the repository stores what it holds, not how it got there.
 * Pure: no Nest, no database.
 */
export class Cart {
  private constructor(
    readonly id: string,
    private readonly lines: Map<string, number>,
    private currentOrderId: string | null,
  ) {}

  static open(id: string): Cart {
    return new Cart(id, new Map(), null);
  }

  static restore(
    id: string,
    lines: { sku: string; quantity: number }[],
    orderId: string | null,
  ): Cart {
    return new Cart(
      id,
      new Map(lines.map((l) => [l.sku, l.quantity])),
      orderId,
    );
  }

  get orderId(): string | null {
    return this.currentOrderId;
  }

  get contents(): { sku: string; quantity: number }[] {
    return [...this.lines].map(([sku, quantity]) => ({ sku, quantity }));
  }

  /** Adding a sku that is already in the cart adds to its quantity. */
  add(sku: string, quantity: number): void {
    this.requireOpen();
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new CheckoutRuleViolation('quantity must be a positive integer');
    }
    this.lines.set(sku, (this.lines.get(sku) ?? 0) + quantity);
  }

  /** False when the sku is not in the cart. */
  remove(sku: string): boolean {
    this.requireOpen();
    return this.lines.delete(sku);
  }

  /**
   * Freezes the lines at the prices quoted now and binds the cart to its order.
   * Every sku in the cart must have a quote and still be available.
   */
  checkOut(orderId: string, quotes: Map<string, PriceQuote>): OrderLine[] {
    this.requireOpen();
    if (this.lines.size === 0) {
      throw new CheckoutRuleViolation(`Cart ${this.id} is empty`);
    }
    const lines = this.contents.map(({ sku, quantity }) => {
      const quote = quotes.get(sku);
      if (!quote?.available) {
        throw new CheckoutRuleViolation(`Product ${sku} is not available`);
      }
      return { sku, quantity, unitPrice: quote.unitPrice };
    });
    this.currentOrderId = orderId;
    return lines;
  }

  private requireOpen(): void {
    if (this.currentOrderId !== null) {
      throw new CheckoutRuleViolation(`Cart ${this.id} is already checked out`);
    }
  }
}
