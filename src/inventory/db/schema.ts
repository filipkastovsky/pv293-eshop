import { integer, jsonb, pgSchema, text } from 'drizzle-orm/pg-core';

export const inventory = pgSchema('inventory');

/** Stock per SKU. Available = on_hand - reserved. */
export const stock = inventory.table('stock', {
  sku: text('sku').primaryKey(),
  onHand: integer('on_hand').notNull().default(0),
  reserved: integer('reserved').notNull().default(0),
});

export interface ReservedLine {
  sku: string;
  quantity: number;
}

/**
 * One row per order Inventory has seen. The primary key on order_id is what
 * makes a duplicate OrderPlaced (or OrderCancelled) a no-op.
 */
export const reservation = inventory.table('reservation', {
  orderId: text('order_id').primaryKey(),
  status: text('status').$type<ReservationStatus>().notNull(),
  lines: jsonb('lines').$type<ReservedLine[]>().notNull(),
});

export type ReservationStatus = 'reserved' | 'failed' | 'released';
