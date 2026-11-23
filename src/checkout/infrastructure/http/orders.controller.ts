import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetOrderSummary, OrderSummary } from '../../../contracts';
import { PlaceOrder } from '../../application/place-order';
import { RuleViolationInterceptor } from './rule-violation.interceptor';

@Controller('orders/:orderId')
@UseInterceptors(RuleViolationInterceptor)
export class OrdersController {
  constructor(
    private readonly placeOrder: PlaceOrder,
    private readonly queries: QueryBus,
  ) {}

  @Get()
  async summary(@Param('orderId') orderId: string): Promise<OrderSummary> {
    const summary = await this.queries.execute(new GetOrderSummary(orderId));
    if (!summary) throw new NotFoundException(`Order ${orderId} not found`);
    return summary;
  }

  @Post('place')
  @HttpCode(202)
  async place(@Param('orderId') orderId: string): Promise<void> {
    await this.placeOrder.execute(orderId);
  }
}
