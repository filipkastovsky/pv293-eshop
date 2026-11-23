import { bigint, boolean, jsonb, pgSchema, text } from 'drizzle-orm/pg-core';
import type { OrderLine } from '../../contracts';
import type { CartItem } from '../domain/cart';

export const checkout = pgSchema('checkout');

export const orderStatus = checkout.enum('order_status', [
  'created',
  'placed',
  'paid',
  'cancelled',
]);

export const carts = checkout.table('carts', {
  id: text('id').primaryKey(),
  items: jsonb('items').$type<readonly CartItem[]>().notNull(),
  checkedOut: boolean('checked_out').notNull(),
});

export const orders = checkout.table('orders', {
  id: text('id').primaryKey(),
  cartId: text('cart_id')
    .notNull()
    .unique()
    .references(() => carts.id),
  status: orderStatus('status').notNull(),
  customerEmail: text('customer_email').notNull(),
  lines: jsonb('lines').$type<OrderLine[]>().notNull(),
  totalInCents: bigint('total_in_cents', { mode: 'number' }).notNull(),
});
