import type { OrderLine } from '../../contracts';
import { CheckoutRuleViolation } from './checkout-rule-violation';
import { totalOf } from './money';

export type OrderStatus = 'created' | 'placed' | 'paid' | 'cancelled';

/**
 * What an order's stream stores. Names match the contract events, so a stored event can be
 * published as is; the payload may carry more than the contract (OrderCreated keeps the lines
 * and email the order needs to rebuild itself), and publishing keeps only the contract's fields.
 */
export type OrderHistoryEvent =
  | {
      type: 'OrderCreated';
      orderId: string;
      cartId: string;
      customerEmail: string;
      lines: OrderLine[];
    }
  | {
      type: 'OrderPlaced';
      orderId: string;
      customerEmail: string;
      lines: OrderLine[];
      total: number;
    }
  | { type: 'OrderPaid'; orderId: string; paymentId: string }
  | { type: 'OrderCancelled'; orderId: string; reason: string };

export interface OrderSnapshot {
  orderId: string;
  status: OrderStatus;
  customerEmail: string;
  lines: OrderLine[];
  total: number;
}

/**
 * An order, event-sourced: its state is the fold of its history, never stored on its own.
 * Commands check the rules and record new events; `pendingEvents` are what the repository
 * appends after `version`. Repeating a command that already happened records nothing, because
 * events from other modules may arrive more than once.
 */
export class Order {
  private status: OrderStatus = 'created';
  private customerEmail = '';
  private lines: OrderLine[] = [];
  private loadedVersion = 0;
  private readonly pending: OrderHistoryEvent[] = [];

  private constructor(readonly id: string) {}

  static create(input: {
    orderId: string;
    cartId: string;
    customerEmail: string;
    lines: OrderLine[];
  }): Order {
    if (input.lines.length === 0) {
      throw new CheckoutRuleViolation('An order needs at least one line');
    }
    const order = new Order(input.orderId);
    order.record({ type: 'OrderCreated', ...input });
    return order;
  }

  static fromHistory(orderId: string, history: OrderHistoryEvent[]): Order {
    if (history[0]?.type !== 'OrderCreated') {
      throw new Error(`Order ${orderId}: history must start with OrderCreated`);
    }
    const order = new Order(orderId);
    for (const event of history) order.apply(event);
    order.loadedVersion = history.length;
    return order;
  }

  /** The version the order was loaded at; new events are appended after it. */
  get version(): number {
    return this.loadedVersion;
  }

  get pendingEvents(): readonly OrderHistoryEvent[] {
    return this.pending;
  }

  get currentStatus(): OrderStatus {
    return this.status;
  }

  snapshot(): OrderSnapshot {
    return {
      orderId: this.id,
      status: this.status,
      customerEmail: this.customerEmail,
      lines: this.lines.map((l) => ({ ...l })),
      total: totalOf(this.lines),
    };
  }

  place(): void {
    if (this.status === 'placed') return;
    this.require('created', 'placed');
    this.record({
      type: 'OrderPlaced',
      orderId: this.id,
      customerEmail: this.customerEmail,
      lines: this.lines.map((l) => ({ ...l })),
      total: totalOf(this.lines),
    });
  }

  markPaid(paymentId: string): void {
    if (this.status === 'paid') return;
    this.require('placed', 'paid');
    this.record({ type: 'OrderPaid', orderId: this.id, paymentId });
  }

  cancel(reason: string): void {
    if (this.status === 'cancelled') return;
    if (this.status !== 'created' && this.status !== 'placed') {
      throw new CheckoutRuleViolation(
        `Order ${this.id} is ${this.status} and cannot be cancelled`,
      );
    }
    this.record({ type: 'OrderCancelled', orderId: this.id, reason });
  }

  private require(from: OrderStatus, to: OrderStatus): void {
    if (this.status !== from) {
      throw new CheckoutRuleViolation(
        `Order ${this.id} is ${this.status} and cannot become ${to}`,
      );
    }
  }

  private record(event: OrderHistoryEvent): void {
    this.apply(event);
    this.pending.push(event);
  }

  private apply(event: OrderHistoryEvent): void {
    switch (event.type) {
      case 'OrderCreated':
        this.status = 'created';
        this.customerEmail = event.customerEmail;
        this.lines = event.lines.map((l) => ({ ...l }));
        return;
      case 'OrderPlaced':
        this.status = 'placed';
        return;
      case 'OrderPaid':
        this.status = 'paid';
        return;
      case 'OrderCancelled':
        this.status = 'cancelled';
        return;
    }
  }
}
