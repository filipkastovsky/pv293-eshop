import { defineConfig } from 'drizzle-kit';

export function defineModuleDrizzleConfig(schema: string, dir: string) {
  return defineConfig({
    dialect: 'postgresql',
    schema: `${dir}/db/schema.ts`,
    out: `${dir}/db/migrations`,
    schemaFilter: [schema],
    migrations: { schema, table: '__migrations' },
    dbCredentials: {
      url:
        process.env.DATABASE_URL ??
        'postgres://eshop:eshop@localhost:5432/eshop',
    },
  });
}
