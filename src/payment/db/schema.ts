import {
  bigint,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const payment = pgSchema('payment');

export const payments = payment.table('payments', {
  id: uuid('id').primaryKey(),
  orderId: text('order_id').notNull(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  status: text('status').notNull(),
  failureReason: text('failure_reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

/** Events waiting to be published; written in the same transaction as the state change. */
export const outbox = payment.table('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Tie-break for rows that share a created_at.
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
});
