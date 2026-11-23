import { Injectable, NotFoundException } from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { OrderCancelled, OrderPaid, OrderPlaced } from '../../contracts';
import { CheckoutStore } from '../db/checkout-store';
import type { Order } from '../domain/order';

@Injectable()
export class OrderService {
  constructor(
    private readonly store: CheckoutStore,
    private readonly events: EventBus,
  ) {}

  async placeOrder(orderId: string): Promise<void> {
    const order = await this.transition(orderId, (order) => {
      if (!order) throw new NotFoundException('Order not found');
      return order.place();
    });
    if (order) this.events.publish(new OrderPlaced(order.summary()));
  }

  async markOrderPaid(orderId: string): Promise<void> {
    const order = await this.transition(orderId, (order) => order?.markPaid());
    if (order) this.events.publish(new OrderPaid({ orderId }));
  }

  async cancelOrder(orderId: string): Promise<void> {
    const order = await this.transition(orderId, (order) => order?.cancel());
    if (order) this.events.publish(new OrderCancelled({ orderId, reason: 'out of stock' }));
  }

  private transition(
    orderId: string,
    apply: (order: Order | null) => boolean | undefined,
  ): Promise<Order | null> {
    return this.store.transaction(async (tx) => {
      const order = await this.store.lockOrder(tx, orderId);
      const changed = apply(order);
      if (!order || !changed) return null;
      await this.store.saveOrderStatus(tx, order);
      return order;
    });
  }
}
