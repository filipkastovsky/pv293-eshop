import { INestApplication } from '@nestjs/common';
import { EventBus, QueryBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createTestDb, TestDb } from '../../test/setup-db';
import {
  GetProduct,
  PriceChanged,
  ProductAdded,
  ProductDiscontinued,
} from '../contracts';
import { PlatformModule } from '../platform';
import { CatalogModule } from './catalog.module';

describe('catalog', () => {
  let db: TestDb;
  let app: INestApplication;
  let published: object[];

  const boot = async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PlatformModule.register(), CatalogModule],
    }).compile();
    const a = moduleRef.createNestApplication();
    await a.init();
    return a;
  };
  const http = () => request(app.getHttpServer());
  const count = async () =>
    Number(
      (await db.pool.query('SELECT count(*) FROM catalog.product')).rows[0]
        .count,
    );

  beforeAll(async () => {
    db = await createTestDb();
    process.env.DATABASE_URL = db.url;
    app = await boot();
    published = [];
    app.get(EventBus).subscribe((e) => published.push(e));
  });

  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  it('seed is idempotent', async () => {
    expect(await count()).toBe(5);
    await app.close();
    app = await boot();
    app.get(EventBus).subscribe((e) => published.push(e));
    expect(await count()).toBe(5);
    const { body } = await http().get('/catalog/products').expect(200);
    expect(body.map((p: { sku: string }) => p.sku).sort()).toEqual(
      ['BEER-01', 'CHEESE-01', 'HOODIE-01', 'MAT-01', 'MUG-01'].sort(),
    );
    expect(body.find((p: { sku: string }) => p.sku === 'HOODIE-01').price).toBe(
      120.13,
    );
    expect(published).toEqual([]); // seeding publishes nothing
  });

  it('POST /catalog/products publishes ProductAdded', async () => {
    await http()
      .post('/catalog/products')
      .send({ sku: 'PEN-01', name: 'Pen', price: 2.5 })
      .expect(201);
    expect(published.at(-1)).toBeInstanceOf(ProductAdded);
    expect(published.at(-1)).toMatchObject({
      sku: 'PEN-01',
      name: 'Pen',
      price: 2.5,
    });
  });

  it('adding an existing sku -> 409', async () => {
    const before = published.length;
    await http()
      .post('/catalog/products')
      .send({ sku: 'PEN-01', name: 'Pen again', price: 3 })
      .expect(409);
    expect(published).toHaveLength(before);
  });

  it('PATCH price publishes PriceChanged', async () => {
    await http()
      .patch('/catalog/products/PEN-01/price')
      .send({ price: 3.1 })
      .expect(200);
    expect(published.at(-1)).toBeInstanceOf(PriceChanged);
    expect(published.at(-1)).toMatchObject({ sku: 'PEN-01', price: 3.1 });
    await http()
      .patch('/catalog/products/NOPE/price')
      .send({ price: 1 })
      .expect(404);
  });

  it('GetProduct returns null for an unknown sku, available=false once discontinued', async () => {
    const queries = app.get(QueryBus);
    expect(await queries.execute(new GetProduct('NOPE'))).toBeNull();
    expect(await queries.execute(new GetProduct('PEN-01'))).toEqual({
      sku: 'PEN-01',
      name: 'Pen',
      price: 3.1,
      available: true,
    });
    await http().post('/catalog/products/PEN-01/discontinue').expect(201);
    expect(published.at(-1)).toBeInstanceOf(ProductDiscontinued);
    expect(await queries.execute(new GetProduct('PEN-01'))).toMatchObject({
      available: false,
    });
  });
});
