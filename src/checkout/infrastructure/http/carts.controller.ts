import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { AddItemToCart } from '../../application/add-item-to-cart';
import { CheckOutCart } from '../../application/check-out-cart';
import { RemoveItemFromCart } from '../../application/remove-item-from-cart';
import { RuleViolationInterceptor } from './rule-violation.interceptor';

const requireText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value;
};

@Controller('carts/:cartId')
@UseInterceptors(RuleViolationInterceptor)
export class CartsController {
  constructor(
    private readonly addItemToCart: AddItemToCart,
    private readonly removeItemFromCart: RemoveItemFromCart,
    private readonly checkOutCart: CheckOutCart,
  ) {}

  @Post('items')
  async addItem(
    @Param('cartId') cartId: string,
    @Body() body: { sku?: unknown; quantity?: unknown },
  ): Promise<void> {
    const sku = requireText(body?.sku, 'sku');
    const quantity = body?.quantity;
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    await this.addItemToCart.execute(cartId, sku, quantity);
  }

  @Delete('items/:sku')
  @HttpCode(204)
  async removeItem(
    @Param('cartId') cartId: string,
    @Param('sku') sku: string,
  ): Promise<void> {
    await this.removeItemFromCart.execute(cartId, sku);
  }

  @Post('checkout')
  async checkout(
    @Param('cartId') cartId: string,
    @Body() body: { customerEmail?: unknown },
  ): Promise<{ orderId: string }> {
    const customerEmail = requireText(body?.customerEmail, 'customerEmail');
    if (!customerEmail.includes('@')) {
      throw new BadRequestException('customerEmail must be an email address');
    }
    return { orderId: await this.checkOutCart.execute(cartId, customerEmail) };
  }
}
