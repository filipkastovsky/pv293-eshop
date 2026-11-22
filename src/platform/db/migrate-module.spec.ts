import { join } from 'node:path';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { createTestDb, TestDb } from '../../../test/setup-db';
import { migrateModule } from './migrate-module';

const fixture = (name: string) => join(__dirname, '__fixtures__', name);

describe('migrateModule', () => {
  let t: TestDb;
  let db: NodePgDatabase;

  beforeAll(async () => {
    t = await createTestDb();
    db = drizzle(t.pool);
  });
  afterAll(async () => {
    await t.drop();
  });

  const count = async (table: string) =>
    Number((await t.pool.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

  it('creates the module schema and its tables', async () => {
    await migrateModule(db, {
      schema: 'catalog',
      migrationsFolder: fixture('catalog'),
    });
    const r = await t.pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog'`,
    );
    expect(r.rows.map((x) => x.table_name)).toEqual(
      expect.arrayContaining(['product', '__migrations']),
    );
  });

  it('rerun is a no-op', async () => {
    const opts = { schema: 'catalog', migrationsFolder: fixture('catalog') };
    await migrateModule(db, opts);
    const before = await count('catalog.__migrations');
    await expect(migrateModule(db, opts)).resolves.toBeUndefined();
    expect(await count('catalog.__migrations')).toBe(before);
  });

  it('two modules keep separate migration tables', async () => {
    await migrateModule(db, {
      schema: 'catalog',
      migrationsFolder: fixture('catalog'),
    });
    await migrateModule(db, {
      schema: 'payment',
      migrationsFolder: fixture('payment'),
    });
    const r = await t.pool.query(
      `SELECT table_schema FROM information_schema.tables WHERE table_name = '__migrations'`,
    );
    expect(r.rows.map((x) => x.table_schema).sort()).toEqual([
      'catalog',
      'payment',
    ]);
  });
});
