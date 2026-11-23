import { join } from 'node:path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB, migrateModule } from '../../platform';
import { Cart } from '../domain/cart';
import { Order } from '../domain/order';
import { carts, orders } from './schema';

type CheckoutTransaction = Parameters<
  Parameters<NodePgDatabase['transaction']>[0]
>[0];

@Injectable()
export class CheckoutStore implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  onModuleInit(): Promise<void> {
    return migrateModule(this.db, {
      schema: 'checkout',
      migrationsFolder: join(__dirname, 'migrations'),
    });
  }

  transaction<T>(work: (tx: CheckoutTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(work);
  }

  async ensureCart(tx: CheckoutTransaction, cartId: string): Promise<void> {
    await tx
      .insert(carts)
      .values({ id: cartId, items: [], checkedOut: false })
      .onConflictDoNothing();
  }

  async findCart(cartId: string): Promise<Cart | null> {
    const [row] = await this.db.select().from(carts).where(eq(carts.id, cartId));
    return row ? new Cart(row.id, row.items, row.checkedOut) : null;
  }

  async lockCart(tx: CheckoutTransaction, cartId: string): Promise<Cart | null> {
    const [row] = await tx.select().from(carts).where(eq(carts.id, cartId)).for('update');
    return row ? new Cart(row.id, row.items, row.checkedOut) : null;
  }

  async saveCart(tx: CheckoutTransaction, cart: Cart): Promise<void> {
    await tx
      .update(carts)
      .set({ items: cart.items, checkedOut: cart.checkedOut })
      .where(eq(carts.id, cart.id));
  }

  async orderIdForCart(cartId: string): Promise<string> {
    const [row] = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.cartId, cartId));
    if (!row) throw new Error('Checked-out cart has no order');
    return row.id;
  }

  async insertOrder(tx: CheckoutTransaction, order: Order): Promise<void> {
    await tx.insert(orders).values({
      id: order.id,
      cartId: order.cartId,
      status: order.status,
      customerEmail: order.customerEmail,
      lines: order.lines,
      totalInCents: order.totalInCents,
    });
  }

  async findOrder(orderId: string): Promise<Order | null> {
    const [row] = await this.db.select().from(orders).where(eq(orders.id, orderId));
    return row ? this.toOrder(row) : null;
  }

  async lockOrder(tx: CheckoutTransaction, orderId: string): Promise<Order | null> {
    const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
    return row ? this.toOrder(row) : null;
  }

  async saveOrderStatus(tx: CheckoutTransaction, order: Order): Promise<void> {
    await tx.update(orders).set({ status: order.status }).where(eq(orders.id, order.id));
  }

  private toOrder(row: typeof orders.$inferSelect): Order {
    return new Order(row.id, row.cartId, row.status, row.customerEmail, row.lines, row.totalInCents);
  }
}
