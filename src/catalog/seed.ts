import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { product } from './db/schema';

const PRODUCTS = [
  { sku: 'BEER-01', name: 'Craft Lager 0.5 l', price: '2.90' },
  { sku: 'MAT-01', name: 'Yoga Mat', price: '24.50' },
  { sku: 'CHEESE-01', name: 'Moravian Cheese 200 g', price: '6.40' },
  { sku: 'CUP-01', name: 'Enamel Cup', price: '8.00' },
  // Amount in cents ends in 13: the fake payment gateway declines it.
  { sku: 'HOODIE-01', name: 'Hoodie', price: '120.13' },
];

/** Inserts the demo products when the table is empty. Publishes no events. */
export async function seedIfEmpty(db: NodePgDatabase): Promise<void> {
  const existing = await db.select({ sku: product.sku }).from(product).limit(1);
  if (existing.length === 0) await db.insert(product).values(PRODUCTS);
}
