import { Injectable, NotFoundException } from '@nestjs/common';
import { EventBus, QueryBus } from '@nestjs/cqrs';
import {
  CartCheckedOut,
  GetProduct,
  ItemAddedToCart,
  ItemRemovedFromCart,
  OrderCreated,
} from '../../contracts';
import { CheckoutStore } from '../db/checkout-store';
import type { CartItem } from '../domain/cart';
import { CheckoutConflict } from '../domain/checkout-conflict';
import { CreateOrderPolicy } from './create-order.policy';

@Injectable()
export class CartService {
  constructor(
    private readonly store: CheckoutStore,
    private readonly queries: QueryBus,
    private readonly events: EventBus,
    private readonly createOrder: CreateOrderPolicy,
  ) {}

  async addItem(cartId: string, sku: string, quantity: number): Promise<void> {
    await this.store.transaction(async (tx) => {
      await this.store.ensureCart(tx, cartId);
      const cart = await this.store.lockCart(tx, cartId);
      if (!cart) throw new Error('Cart disappeared after creation');
      cart.addItem(sku, quantity);
      await this.store.saveCart(tx, cart);
    });
    this.events.publish(new ItemAddedToCart({ cartId, sku, quantity }));
  }

  async removeItem(cartId: string, sku: string): Promise<void> {
    const removed = await this.store.transaction(async (tx) => {
      const cart = await this.store.lockCart(tx, cartId);
      if (!cart?.removeItem(sku)) return false;
      await this.store.saveCart(tx, cart);
      return true;
    });
    if (removed) this.events.publish(new ItemRemovedFromCart({ cartId, sku }));
  }

  async checkOut(cartId: string, customerEmail: string): Promise<string> {
    for (;;) {
      const cart = await this.store.findCart(cartId);
      if (!cart) throw new NotFoundException('Cart not found');
      if (cart.checkedOut) return this.store.orderIdForCart(cartId);

      cart.checkOut();
      // Catalog shares the database pool. Read prices before opening a transaction.
      const lines = await Promise.all(
        cart.items.map((item) => this.price(item)),
      );
      const checkedOut = new CartCheckedOut({ cartId, customerEmail, lines });
      const order = await this.store.transaction(async (tx) => {
        const current = await this.store.lockCart(tx, cartId);
        if (!current) throw new NotFoundException('Cart not found');
        if (current.checkedOut || !current.hasSameItems(cart)) return null;

        // Checkout owns both aggregates, so its local policy can run in the same transaction.
        const order = this.createOrder.handle(checkedOut);
        await this.store.saveCart(tx, cart);
        await this.store.insertOrder(tx, order);
        return order;
      });
      if (!order) continue;

      this.events.publish(checkedOut);
      this.events.publish(new OrderCreated({ orderId: order.id, cartId }));
      return order.id;
    }
  }

  private async price({ sku, quantity }: CartItem) {
    const product = await this.queries.execute(new GetProduct(sku));
    if (!product)
      throw new NotFoundException('Cart contains an unknown product');
    if (!product.available)
      throw new CheckoutConflict('Cart contains a discontinued product');
    return { sku, quantity, unitPrice: product.price };
  }
}
