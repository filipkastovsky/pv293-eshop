import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import type { Response } from 'express';
import { GetOrderSummary } from '../contracts';
import { CartService } from './application/cart.service';
import { OrderService } from './application/order.service';
import { CheckoutConflict } from './domain/checkout-conflict';

@Catch(CheckoutConflict)
class CheckoutConflictFilter implements ExceptionFilter<CheckoutConflict> {
  catch(error: CheckoutConflict, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(409).json({
      statusCode: 409,
      message: error.message,
      error: 'Conflict',
    });
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.includes('\0')) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value;
}

@Controller()
@UseFilters(CheckoutConflictFilter)
export class CheckoutController {
  constructor(
    private readonly carts: CartService,
    private readonly orders: OrderService,
    private readonly queries: QueryBus,
  ) {}

  @Post('carts/:cartId/items')
  async addItem(
    @Param('cartId') cartId: string,
    @Body() body: { sku?: unknown; quantity?: unknown },
  ): Promise<void> {
    const sku = requiredText(body?.sku, 'sku');
    const quantity = body?.quantity;
    if (
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    ) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    await this.carts.addItem(requiredText(cartId, 'cartId'), sku, quantity);
  }

  @Delete('carts/:cartId/items/:sku')
  @HttpCode(204)
  async removeItem(
    @Param('cartId') cartId: string,
    @Param('sku') sku: string,
  ): Promise<void> {
    await this.carts.removeItem(
      requiredText(cartId, 'cartId'),
      requiredText(sku, 'sku'),
    );
  }

  @Post('carts/:cartId/checkout')
  async checkOut(
    @Param('cartId') cartId: string,
    @Body() body: { customerEmail?: unknown },
  ): Promise<{ orderId: string }> {
    const customerEmail = requiredText(body?.customerEmail, 'customerEmail');
    if (
      customerEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)
    ) {
      throw new BadRequestException(
        'customerEmail must be a valid email address',
      );
    }
    const orderId = await this.carts.checkOut(
      requiredText(cartId, 'cartId'),
      customerEmail,
    );
    return { orderId };
  }

  @Post('orders/:orderId/place')
  @HttpCode(202)
  async placeOrder(@Param('orderId') orderId: string): Promise<void> {
    await this.orders.placeOrder(requiredText(orderId, 'orderId'));
  }

  @Get('orders/:orderId')
  async orderSummary(@Param('orderId') orderId: string) {
    const order = await this.queries.execute(
      new GetOrderSummary(requiredText(orderId, 'orderId')),
    );
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }
}
