import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderRepository } from '../infrastructure/order.repository';

@Injectable()
export class PlaceOrder {
  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string): Promise<void> {
    const order = await this.orders.change(orderId, (order) => order.place());
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
  }
}
