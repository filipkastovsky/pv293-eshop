import { boolean, numeric, pgSchema, text } from 'drizzle-orm/pg-core';

export const catalog = pgSchema('catalog');

export const product = catalog.table('product', {
  sku: text('sku').primaryKey(),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  available: boolean('available').notNull().default(true),
});
