import { pgSchema } from 'drizzle-orm/pg-core';

// No tables yet: add yours here, then `npm run db:generate -- inventory`.
export const inventory = pgSchema('inventory');
