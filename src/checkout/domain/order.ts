import {
  OrderCancelled,
  OrderCreated,
  OrderLine,
  OrderPaid,
  OrderPlaced,
  OrderSummary,
} from '../../contracts';
import { AggregateRoot } from './aggregate-root';
import { conflict, invalid } from './errors';
import { totalOf } from './money';

export type OrderStatus = OrderSummary['status'];

export interface OrderSnapshot {
  id: string;
  cartId: string;
  status: OrderStatus;
  customerEmail: string;
  lines: OrderLine[];
  version: number;
}

/**
 * The order lifecycle: created -> placed -> paid, or placed -> cancelled.
 * Repeating a transition that already happened is a no-op (no second event),
 * so a duplicate event cannot pay or cancel an order twice.
 */
export class Order extends AggregateRoot {
  private constructor(
    readonly id: string,
    readonly cartId: string,
    private status: OrderStatus,
    readonly customerEmail: string,
    private readonly lines: readonly OrderLine[],
    version: number,
  ) {
    super(version);
  }

  static create(
    id: string,
    cartId: string,
    customerEmail: string,
    lines: OrderLine[],
  ): Order {
    if (lines.length === 0) throw invalid('An order needs at least one line');
    const order = new Order(
      id,
      cartId,
      'created',
      customerEmail,
      lines.map((l) => ({ ...l })),
      0,
    );
    order.record(new OrderCreated({ orderId: id, cartId }));
    return order;
  }

  static restore(s: OrderSnapshot): Order {
    return new Order(
      s.id,
      s.cartId,
      s.status,
      s.customerEmail,
      s.lines,
      s.version,
    );
  }

  get total(): number {
    return totalOf(this.lines);
  }

  place(): void {
    if (this.status === 'placed') return;
    this.requireStatus('created', 'placed');
    this.status = 'placed';
    this.record(
      new OrderPlaced({
        orderId: this.id,
        customerEmail: this.customerEmail,
        lines: this.lines.map((l) => ({ ...l })),
        total: this.total,
      }),
    );
  }

  markPaid(): void {
    if (this.status === 'paid') return;
    this.requireStatus('placed', 'paid');
    this.status = 'paid';
    this.record(new OrderPaid({ orderId: this.id }));
  }

  /** A paid order is not cancelled here: that would need a refund. */
  cancel(reason: string): void {
    if (this.status === 'cancelled') return;
    if (this.status !== 'created' && this.status !== 'placed') {
      throw conflict(`Order ${this.id} is ${this.status}, cannot cancel it`);
    }
    this.status = 'cancelled';
    this.record(new OrderCancelled({ orderId: this.id, reason }));
  }

  summary(): OrderSummary {
    return {
      orderId: this.id,
      status: this.status,
      customerEmail: this.customerEmail,
      lines: this.lines.map((l) => ({ ...l })),
      total: this.total,
    };
  }

  snapshot(): OrderSnapshot {
    return {
      id: this.id,
      cartId: this.cartId,
      status: this.status,
      customerEmail: this.customerEmail,
      lines: this.lines.map((l) => ({ ...l })),
      version: this.version,
    };
  }

  private requireStatus(expected: OrderStatus, target: OrderStatus): void {
    if (this.status !== expected) {
      throw conflict(
        `Order ${this.id} is ${this.status}, cannot become ${target}`,
      );
    }
  }
}
