import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const checkout = pgSchema('checkout');

/** Cart: state-based. One row per cart; `order_id` is set when the cart is checked out. */
export const carts = checkout.table('carts', {
  id: text('id').primaryKey(),
  orderId: text('order_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
});

export const cartLines = checkout.table(
  'cart_lines',
  {
    cartId: text('cart_id')
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    quantity: integer('quantity').notNull(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.sku] })],
);

/**
 * Every event Checkout emits, appended in the transaction that causes it.
 * - Order streams (`stream_type = 'order'`) are the event store: an order's state is the fold of
 *   its rows, in `version` order. `(stream_type, stream_id, version)` is unique, so two writers
 *   that loaded the same version cannot both append.
 * - Cart rows (`version` null) are only here to be published; the cart's state is in `carts`.
 * - `published_at` makes the table the outbox as well.
 */
export const events = checkout.table(
  'events',
  {
    seq: bigint('seq', { mode: 'number' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    streamType: text('stream_type').notNull(),
    streamId: text('stream_id').notNull(),
    version: integer('version'),
    name: text('name').notNull(),
    payload: jsonb('payload').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp('published_at', {
      withTimezone: true,
      mode: 'date',
    }),
  },
  (t) => [
    uniqueIndex('events_stream_version_idx').on(
      t.streamType,
      t.streamId,
      t.version,
    ),
    // The sweeper looks only at rows not yet published.
    index('events_unpublished_idx')
      .on(t.seq)
      .where(sql`${t.publishedAt} is null`),
  ],
);
