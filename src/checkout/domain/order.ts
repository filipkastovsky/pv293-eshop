import type { OrderLine, OrderSummary } from '../../contracts';
import { CheckoutConflict } from './checkout-conflict';

export class Order {
  constructor(
    readonly id: string,
    readonly cartId: string,
    private currentStatus: OrderSummary['status'],
    readonly customerEmail: string,
    readonly lines: OrderLine[],
    readonly totalInCents: number,
  ) {}

  static create(
    id: string,
    cartId: string,
    customerEmail: string,
    lines: OrderLine[],
  ): Order {
    const totalInCents = lines.reduce(
      (total, { quantity, unitPrice }) =>
        total + quantity * Math.round(unitPrice * 100),
      0,
    );
    if (!Number.isSafeInteger(totalInCents)) {
      throw new CheckoutConflict('Order total is too large');
    }
    return new Order(id, cartId, 'created', customerEmail, lines, totalInCents);
  }

  get status(): OrderSummary['status'] {
    return this.currentStatus;
  }

  place(): boolean {
    if (this.currentStatus === 'placed') return false;
    if (this.currentStatus !== 'created') {
      throw new CheckoutConflict('Only a created order can be placed');
    }
    this.currentStatus = 'placed';
    return true;
  }

  markPaid(): boolean {
    return this.finish('paid');
  }

  cancel(): boolean {
    return this.finish('cancelled');
  }

  private finish(status: 'paid' | 'cancelled'): boolean {
    if (this.currentStatus !== 'placed') return false;
    this.currentStatus = status;
    return true;
  }

  summary(): OrderSummary {
    return {
      orderId: this.id,
      status: this.currentStatus,
      customerEmail: this.customerEmail,
      lines: this.lines,
      total: this.totalInCents / 100,
    };
  }
}
