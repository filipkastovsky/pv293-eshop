import { Injectable, Logger } from '@nestjs/common';
import { OrderRepository } from '../infrastructure/order.repository';

@Injectable()
export class CancelOrder {
  private readonly logger = new Logger(CancelOrder.name);

  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string, reason: string): Promise<void> {
    const order = await this.orders.change(orderId, (order) => {
      // Business rule: paid is final. Stock that fails after payment needs a person.
      if (order.currentStatus === 'paid') {
        this.logger.warn('cancellation of a paid order ignored', {
          orderId,
          reason,
        });
        return;
      }
      order.cancel(reason);
    });
    if (!order) throw new Error(`Order ${orderId} not found`);
  }
}
