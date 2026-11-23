import { sql } from 'drizzle-orm';
import {
  bigint,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const payment = pgSchema('payment');

export const payments = payment.table(
  'payments',
  {
    id: uuid('id').primaryKey(),
    orderId: text('order_id').notNull(),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    status: text('status').notNull(),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // At most one live payment per order; a failed one may be retried.
    uniqueIndex('payments_live_order_idx')
      .on(t.orderId)
      .where(sql`${t.status} in ('initiated', 'succeeded')`),
  ],
);

/** Events waiting to be published; written in the same transaction as the state change. */
export const outbox = payment.table('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Tie-break for rows that share a created_at.
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb('payload').notNull(),
  // W3C trace context of the request that wrote the row; the relay links its span to it.
  traceContext: jsonb('trace_context'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
});
