import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetOrderSummary, OrderSummary } from '../../contracts';
import { OrderRepository } from '../infrastructure/order.repository';

/** Public query. Replays the order's stream on every read, so the answer is never stale. */
@QueryHandler(GetOrderSummary)
export class GetOrderSummaryHandler implements IQueryHandler<GetOrderSummary> {
  constructor(private readonly orders: OrderRepository) {}

  async execute(query: GetOrderSummary): Promise<OrderSummary | null> {
    const order = await this.orders.load(query.orderId);
    return order ? order.snapshot() : null;
  }
}
