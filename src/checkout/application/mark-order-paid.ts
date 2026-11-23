import { Injectable, Logger } from '@nestjs/common';
import { OrderRepository } from '../infrastructure/order.repository';

@Injectable()
export class MarkOrderPaid {
  private readonly logger = new Logger(MarkOrderPaid.name);

  constructor(private readonly orders: OrderRepository) {}

  async execute(orderId: string, paymentId: string): Promise<void> {
    const order = await this.orders.change(orderId, (order) => {
      // Business rule: cancelled is final. A payment that lands after the cancellation is
      // left for a refund process, which does not exist yet.
      if (order.currentStatus === 'cancelled') {
        this.logger.warn('payment succeeded for a cancelled order, ignored', {
          orderId,
          paymentId,
        });
        return;
      }
      order.markPaid(paymentId);
    });
    if (!order) throw new Error(`Order ${orderId} not found`);
  }
}
