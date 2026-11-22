import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetOrderSummary, OrderSummary } from '../../contracts';
import { OrderRepository } from '../infrastructure/order.repository';

/** The public query: other modules read orders only through this. */
@QueryHandler(GetOrderSummary)
export class GetOrderSummaryHandler implements IQueryHandler<GetOrderSummary> {
  constructor(private readonly orders: OrderRepository) {}

  async execute({ orderId }: GetOrderSummary): Promise<OrderSummary | null> {
    return (await this.orders.find(orderId))?.summary() ?? null;
  }
}
