import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { createTestDb, TestDb } from './setup-db';

describe('GET /health', () => {
  let app: INestApplication;
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    process.env.DATABASE_URL = db.url;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it('returns 200 and status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
