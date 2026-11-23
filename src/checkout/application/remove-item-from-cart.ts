import { Injectable, NotFoundException } from '@nestjs/common';
import { ItemRemovedFromCart } from '../../contracts';
import { CartRepository } from '../infrastructure/cart.repository';

@Injectable()
export class RemoveItemFromCart {
  constructor(private readonly carts: CartRepository) {}

  async execute(cartId: string, sku: string): Promise<void> {
    const cart = await this.carts.change(
      cartId,
      { createIfMissing: false },
      (cart) => {
        if (!cart.remove(sku)) {
          throw new NotFoundException(
            `Product ${sku} is not in cart ${cartId}`,
          );
        }
        return [new ItemRemovedFromCart({ cartId, sku })];
      },
    );
    if (!cart) throw new NotFoundException(`Cart ${cartId} not found`);
  }
}
