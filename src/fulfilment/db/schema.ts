import { pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const fulfilment = pgSchema('fulfilment');

/** One shipment per paid order: the primary key on order_id makes a duplicate OrderPaid a no-op. */
export const shipment = fulfilment.table('shipment', {
  orderId: text('order_id').primaryKey(),
  shipmentId: text('shipment_id').notNull().unique(),
  status: text('status').notNull(),
  packedAt: timestamp('packed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
