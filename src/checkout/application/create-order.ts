import { Injectable } from '@nestjs/common';
import type { OrderLine } from '../../contracts';
import { Order } from '../domain/order';
import { CartRepository } from '../infrastructure/cart.repository';
import {
  OrderConcurrencyError,
  OrderRepository,
} from '../infrastructure/order.repository';

/** Open the order for a checked-out cart, under the id the checkout chose. */
@Injectable()
export class CreateOrder {
  constructor(
    private readonly carts: CartRepository,
    private readonly orders: OrderRepository,
  ) {}

  async execute(input: {
    cartId: string;
    customerEmail: string;
    lines: OrderLine[];
  }): Promise<void> {
    const orderId = await this.carts.orderIdOf(input.cartId);
    if (!orderId) {
      throw new Error(`Cart ${input.cartId} has not been checked out`);
    }
    // CartCheckedOut seen twice: the order already exists.
    if (await this.orders.load(orderId)) return;
    try {
      await this.orders.save(Order.create({ orderId, ...input }));
    } catch (err) {
      if (err instanceof OrderConcurrencyError) return;
      throw err;
    }
  }
}
