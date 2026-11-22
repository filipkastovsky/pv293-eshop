import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

const ADMIN_URL =
  process.env.DATABASE_URL ?? 'postgres://eshop:eshop@localhost:5432/eshop';

export interface TestDb {
  pool: Pool;
  url: string;
  drop(): Promise<void>;
}

/** Creates a uniquely named throwaway database; call `drop()` afterwards. */
export async function createTestDb(): Promise<TestDb> {
  const name = `test_${randomUUID().replace(/-/g, '')}`;
  const admin = new Pool({ connectionString: ADMIN_URL, max: 1 });
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.toString() });

  return {
    pool,
    url: url.toString(),
    async drop() {
      await pool.end();
      const a = new Pool({ connectionString: ADMIN_URL, max: 1 });
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}
