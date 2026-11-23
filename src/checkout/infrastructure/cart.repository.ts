import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent } from '../../contracts';
import { DB } from '../../platform';
import { cartLines, carts } from '../db/schema';
import { Cart } from '../domain/cart';
import { EventLog } from './event-log';

/** Carts are stored as state; the events a change emits go to the event log with it. */
@Injectable()
export class CartRepository {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly log: EventLog,
  ) {}

  /**
   * Runs `change` on the cart under a row lock, stores the new state and the events `change`
   * returns in one transaction, then publishes the events. Resolves to null for an unknown cart
   * unless `createIfMissing`.
   */
  async change(
    cartId: string,
    options: { createIfMissing: boolean },
    change: (cart: Cart) => Promise<DomainEvent[]> | DomainEvent[],
  ): Promise<Cart | null> {
    const outcome = await this.db.transaction(async (tx) => {
      if (options.createIfMissing) {
        await tx.insert(carts).values({ id: cartId }).onConflictDoNothing();
      }
      const [row] = await tx
        .select()
        .from(carts)
        .where(eq(carts.id, cartId))
        .for('update');
      if (!row) return null;
      const lines = await tx
        .select({ sku: cartLines.sku, quantity: cartLines.quantity })
        .from(cartLines)
        .where(eq(cartLines.cartId, cartId));
      const cart = Cart.restore(cartId, lines, row.orderId);

      const emitted = await change(cart);

      await tx
        .update(carts)
        .set({ orderId: cart.orderId })
        .where(eq(carts.id, cartId));
      await tx.delete(cartLines).where(eq(cartLines.cartId, cartId));
      if (cart.contents.length > 0) {
        await tx
          .insert(cartLines)
          .values(cart.contents.map((l) => ({ cartId, ...l })));
      }
      const logged = await this.log.append(
        tx,
        emitted.map((event) => ({
          streamType: 'cart',
          streamId: cartId,
          version: null,
          name: event.constructor.name,
          payload: { ...event },
        })),
      );
      return { cart, logged };
    });
    if (!outcome) return null;
    await this.log.publish(outcome.logged);
    return outcome.cart;
  }

  async orderIdOf(cartId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ orderId: carts.orderId })
      .from(carts)
      .where(eq(carts.id, cartId));
    return row?.orderId ?? null;
  }
}
