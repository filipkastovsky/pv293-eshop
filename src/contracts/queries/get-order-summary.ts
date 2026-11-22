import { Query } from '@nestjs/cqrs';
import type { OrderLine } from '../domain-event';

export type { OrderLine };

export interface OrderSummary {
  orderId: string;
  status: 'created' | 'placed' | 'paid' | 'cancelled';
  customerEmail: string;
  lines: OrderLine[];
  total: number;
}

/** Answered by Checkout. Resolves to null for an unknown order. */
export class GetOrderSummary extends Query<OrderSummary | null> {
  constructor(public readonly orderId: string) {
    super();
  }
}
