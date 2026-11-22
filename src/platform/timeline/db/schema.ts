import {
  bigint,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const platform = pgSchema('platform');

export const timeline = platform.table('timeline', {
  id: uuid('id').primaryKey().defaultRandom(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
  orderId: text('order_id').notNull(),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  payload: jsonb('payload').notNull(),
  at: timestamp('at', { withTimezone: true, mode: 'date' }).notNull(),
});
