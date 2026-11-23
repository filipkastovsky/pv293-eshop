import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetProduct, ItemAddedToCart } from '../../contracts';
import { CheckoutRuleViolation } from '../domain/checkout-rule-violation';
import { CartRepository } from '../infrastructure/cart.repository';

/** Put a product in a cart; the cart is opened on its first item. */
@Injectable()
export class AddItemToCart {
  constructor(
    private readonly carts: CartRepository,
    private readonly queries: QueryBus,
  ) {}

  async execute(cartId: string, sku: string, quantity: number): Promise<void> {
    const product = await this.queries.execute(new GetProduct(sku));
    if (!product) throw new NotFoundException(`Product ${sku} not found`);
    if (!product.available) {
      throw new CheckoutRuleViolation(`Product ${sku} is not available`);
    }
    await this.carts.change(cartId, { createIfMissing: true }, (cart) => {
      cart.add(sku, quantity);
      return [new ItemAddedToCart({ cartId, sku, quantity })];
    });
  }
}
