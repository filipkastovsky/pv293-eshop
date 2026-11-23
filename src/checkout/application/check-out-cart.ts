import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CartCheckedOut, GetProduct } from '../../contracts';
import type { PriceQuote } from '../domain/cart';
import { CartRepository } from '../infrastructure/cart.repository';

/**
 * Check a cart out at today's prices. The order id is chosen here and stored on the cart, so it
 * can be returned now; the order itself is created by CreateOrderPolicy on CartCheckedOut.
 */
@Injectable()
export class CheckOutCart {
  private readonly logger = new Logger(CheckOutCart.name);

  constructor(
    private readonly carts: CartRepository,
    private readonly queries: QueryBus,
  ) {}

  async execute(cartId: string, customerEmail: string): Promise<string> {
    const orderId = randomUUID();
    const cart = await this.carts.change(
      cartId,
      { createIfMissing: false },
      async (cart) => {
        const quotes = new Map<string, PriceQuote>();
        for (const { sku } of cart.contents) {
          const product = await this.queries.execute(new GetProduct(sku));
          if (product) {
            quotes.set(sku, {
              unitPrice: product.price,
              available: product.available,
            });
          }
        }
        const lines = cart.checkOut(orderId, quotes);
        return [new CartCheckedOut({ cartId, customerEmail, lines })];
      },
    );
    if (!cart) throw new NotFoundException(`Cart ${cartId} not found`);
    this.logger.log('cart checked out', { cartId, orderId });
    return orderId;
  }
}
