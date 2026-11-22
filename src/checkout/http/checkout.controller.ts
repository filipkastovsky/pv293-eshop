import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetOrderSummary, OrderSummary } from '../../contracts';
import {
  AddItemToCart,
  CheckOutCart,
  PlaceOrder,
  RemoveItemFromCart,
} from '../application/commands';
import { DomainErrorFilter } from './domain-error.filter';

@Controller()
@UseFilters(DomainErrorFilter)
export class CheckoutController {
  constructor(
    private readonly commands: CommandBus,
    private readonly queries: QueryBus,
  ) {}

  @Post('carts/:cartId/items')
  async addItem(
    @Param('cartId') cartId: string,
    @Body() body: { sku?: unknown; quantity?: unknown },
  ): Promise<void> {
    await this.commands.execute(
      new AddItemToCart(
        cartId,
        String(body?.sku ?? ''),
        Number(body?.quantity),
      ),
    );
  }

  @Delete('carts/:cartId/items/:sku')
  async removeItem(
    @Param('cartId') cartId: string,
    @Param('sku') sku: string,
  ): Promise<void> {
    await this.commands.execute(new RemoveItemFromCart(cartId, sku));
  }

  @Post('carts/:cartId/checkout')
  async checkOut(
    @Param('cartId') cartId: string,
    @Body() body: { customerEmail?: unknown },
  ): Promise<{ orderId: string }> {
    const orderId = await this.commands.execute(
      new CheckOutCart(cartId, String(body?.customerEmail ?? '')),
    );
    return { orderId };
  }

  @Post('orders/:orderId/place')
  @HttpCode(202)
  async place(@Param('orderId') orderId: string): Promise<void> {
    await this.commands.execute(new PlaceOrder(orderId));
  }

  @Get('orders/:orderId')
  async summary(@Param('orderId') orderId: string): Promise<OrderSummary> {
    const summary = await this.queries.execute(new GetOrderSummary(orderId));
    if (!summary) throw new NotFoundException(`Order ${orderId} not found`);
    return summary;
  }
}
