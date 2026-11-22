import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../../platform';
import { order } from '../db/schema';
import { Order, OrderStatus } from '../domain/order';
import { ConcurrencyError } from './concurrency';

/** Stores a whole Order in one row, with an optimistic version check. */
@Injectable()
export class OrderRepository {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  async find(id: string): Promise<Order | null> {
    const [row] = await this.db.select().from(order).where(eq(order.id, id));
    if (!row) return null;
    return Order.restore({
      id: row.id,
      cartId: row.cartId,
      status: row.status as OrderStatus,
      customerEmail: row.customerEmail,
      lines: row.lines,
      version: row.version,
    });
  }

  /**
   * A new order (version 0) that already exists is a ConcurrencyError too:
   * the caller reloads and finds it there.
   */
  async save(aggregate: Order): Promise<void> {
    const s = aggregate.snapshot();
    const saved =
      s.version === 0
        ? await this.db
            .insert(order)
            .values({
              id: s.id,
              cartId: s.cartId,
              status: s.status,
              customerEmail: s.customerEmail,
              lines: s.lines,
              version: 1,
            })
            .onConflictDoNothing()
            .returning({ id: order.id })
        : await this.db
            .update(order)
            .set({ status: s.status, version: s.version + 1 })
            .where(and(eq(order.id, s.id), eq(order.version, s.version)))
            .returning({ id: order.id });
    if (saved.length === 0) throw new ConcurrencyError('Order', s.id);
  }
}
