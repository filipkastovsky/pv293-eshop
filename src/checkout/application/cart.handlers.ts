import { randomUUID } from 'node:crypto';
import {
  CommandHandler,
  EventBus,
  ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { GetProduct, ProductView } from '../../contracts';
import { Cart } from '../domain/cart';
import { notFound } from '../domain/errors';
import { CartRepository } from '../infrastructure/cart.repository';
import { retryOnConflict } from '../infrastructure/concurrency';
import { AddItemToCart, CheckOutCart, RemoveItemFromCart } from './commands';

/** Catalog owns products and prices; we ask it every time (ADR 0005). */
const askProduct = (queries: QueryBus, sku: string) =>
  queries.execute(new GetProduct(sku));

@CommandHandler(AddItemToCart)
export class AddItemToCartHandler implements ICommandHandler<AddItemToCart> {
  constructor(
    private readonly carts: CartRepository,
    private readonly queries: QueryBus,
    private readonly events: EventBus,
  ) {}

  async execute({ cartId, sku, quantity }: AddItemToCart): Promise<void> {
    const product = await askProduct(this.queries, sku);
    const cart = await retryOnConflict(async () => {
      const c = (await this.carts.find(cartId)) ?? Cart.open(cartId);
      c.addItem(sku, quantity, product);
      await this.carts.save(c);
      return c;
    });
    this.events.publishAll(cart.pullEvents());
  }
}

@CommandHandler(RemoveItemFromCart)
export class RemoveItemFromCartHandler
  implements ICommandHandler<RemoveItemFromCart>
{
  constructor(
    private readonly carts: CartRepository,
    private readonly events: EventBus,
  ) {}

  async execute({ cartId, sku }: RemoveItemFromCart): Promise<void> {
    const cart = await retryOnConflict(async () => {
      const c = await this.carts.find(cartId);
      if (!c) throw notFound(`Cart ${cartId} does not exist`);
      c.removeItem(sku);
      await this.carts.save(c);
      return c;
    });
    this.events.publishAll(cart.pullEvents());
  }
}

@CommandHandler(CheckOutCart)
export class CheckOutCartHandler implements ICommandHandler<CheckOutCart> {
  constructor(
    private readonly carts: CartRepository,
    private readonly queries: QueryBus,
    private readonly events: EventBus,
  ) {}

  async execute({ cartId, customerEmail }: CheckOutCart): Promise<string> {
    const cart = await retryOnConflict(async () => {
      const c = await this.carts.find(cartId);
      if (!c) throw notFound(`Cart ${cartId} does not exist`);
      const products = new Map<string, ProductView | null>();
      for (const sku of c.skus) {
        products.set(sku, await askProduct(this.queries, sku));
      }
      c.checkOut(randomUUID(), customerEmail, products);
      await this.carts.save(c);
      return c;
    });
    // The order itself is created by CreateOrderPolicy, reacting to CartCheckedOut.
    this.events.publishAll(cart.pullEvents());
    return cart.orderId as string;
  }
}
