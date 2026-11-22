import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../../platform';
import { cart } from '../db/schema';
import { Cart, CartStatus } from '../domain/cart';
import { ConcurrencyError } from './concurrency';

/** Stores a whole Cart in one row, with an optimistic version check. */
@Injectable()
export class CartRepository {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  async find(id: string): Promise<Cart | null> {
    const [row] = await this.db.select().from(cart).where(eq(cart.id, id));
    if (!row) return null;
    return Cart.restore({
      id: row.id,
      status: row.status as CartStatus,
      items: row.items,
      orderId: row.orderId,
      version: row.version,
    });
  }

  async save(aggregate: Cart): Promise<void> {
    const s = aggregate.snapshot();
    const values = { status: s.status, items: s.items, orderId: s.orderId };
    const saved =
      s.version === 0
        ? await this.db
            .insert(cart)
            .values({ id: s.id, ...values, version: 1 })
            .onConflictDoNothing()
            .returning({ id: cart.id })
        : await this.db
            .update(cart)
            .set({ ...values, version: s.version + 1 })
            .where(and(eq(cart.id, s.id), eq(cart.version, s.version)))
            .returning({ id: cart.id });
    if (saved.length === 0) throw new ConcurrencyError('Cart', s.id);
  }
}
