import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { DbModule } from './db.module';
import { PG_POOL } from './db.tokens';

describe('DbModule', () => {
  it('ends the pool when the app closes', async () => {
    const app = (
      await Test.createTestingModule({ imports: [DbModule] }).compile()
    ).createNestApplication();
    await app.init();
    const pool = app.get<Pool>(PG_POOL);
    expect(pool.ended).toBe(false);
    await app.close();
    expect(pool.ended).toBe(true);
  });
});
