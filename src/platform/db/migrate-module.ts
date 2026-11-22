import { sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export interface MigrateModuleOptions {
  schema: string;
  migrationsFolder: string;
}

/** Runs one module's migrations inside its own schema, with its own `__migrations` table. */
export async function migrateModule(
  db: NodePgDatabase,
  { schema, migrationsFolder }: MigrateModuleOptions,
): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(schema)}`);
  await migrate(db, {
    migrationsFolder,
    migrationsSchema: schema,
    migrationsTable: '__migrations',
  });
}
