import { integer, pgSchema, text, timestamp } from 'drizzle-orm/pg-core';

export const notifications = pgSchema('notifications');

export const message = notifications.table('message', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  kind: text('kind').notNull(), // 'order_summary' | 'cancellation_notice'
  orderId: text('order_id').notNull(),
  to: text('to'), // null when a cancelled order's recipient is unknown
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});
