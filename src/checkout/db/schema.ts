import { integer, jsonb, pgSchema, text } from 'drizzle-orm/pg-core';

export const checkout = pgSchema('checkout');

export interface CartItemRow {
  sku: string;
  quantity: number;
}

export interface OrderLineRow {
  sku: string;
  quantity: number;
  unitPrice: number;
}

/** One row per Cart aggregate; `version` guards concurrent saves. */
export const cart = checkout.table('cart', {
  id: text('id').primaryKey(),
  status: text('status').notNull(),
  items: jsonb('items').$type<CartItemRow[]>().notNull(),
  orderId: text('order_id'),
  version: integer('version').notNull(),
});

/** One row per Order aggregate; one order per cart. */
export const order = checkout.table('order', {
  id: text('id').primaryKey(),
  cartId: text('cart_id').notNull().unique(),
  status: text('status').notNull(),
  customerEmail: text('customer_email').notNull(),
  lines: jsonb('lines').$type<OrderLineRow[]>().notNull(),
  version: integer('version').notNull(),
});
