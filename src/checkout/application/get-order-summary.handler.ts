import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetOrderSummary, OrderSummary } from '../../contracts';
import { CheckoutStore } from '../db/checkout-store';

@QueryHandler(GetOrderSummary)
export class GetOrderSummaryHandler implements IQueryHandler<GetOrderSummary> {
  constructor(private readonly store: CheckoutStore) {}

  async execute(query: GetOrderSummary): Promise<OrderSummary | null> {
    const order = await this.store.findOrder(query.orderId);
    return order?.summary() ?? null;
  }
}
