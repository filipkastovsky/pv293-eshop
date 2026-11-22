import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  PriceChanged,
  ProductAdded,
  ProductDiscontinued,
  ProductView,
} from '../contracts';
import { DB, migrateModule } from '../platform';
import { product } from './db/schema';
import { seedIfEmpty } from './seed';

const toView = (row: typeof product.$inferSelect): ProductView => ({
  sku: row.sku,
  name: row.name,
  price: Number(row.price),
  available: row.available,
});

const requireText = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }
  return value;
};

const requirePrice = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException('price must be a number >= 0');
  }
  return value;
};

/** The whole module: read and write our own table, then tell the world. */
@Injectable()
export class CatalogService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly eventBus: EventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrateModule(this.db, {
      schema: 'catalog',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });
    await seedIfEmpty(this.db);
  }

  async list(): Promise<ProductView[]> {
    return (await this.db.select().from(product)).map(toView);
  }

  async find(sku: string): Promise<ProductView | null> {
    const [row] = await this.db
      .select()
      .from(product)
      .where(eq(product.sku, sku));
    return row ? toView(row) : null;
  }

  async add(input: {
    sku: string;
    name: string;
    price: number;
  }): Promise<ProductView> {
    const sku = requireText(input?.sku, 'sku');
    const name = requireText(input?.name, 'name');
    const price = requirePrice(input?.price);
    const inserted = await this.db
      .insert(product)
      .values({ sku, name, price: price.toFixed(2) })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ConflictException(`Product ${sku} already exists`);
    }
    const view = toView(inserted[0]);
    this.eventBus.publish(
      new ProductAdded({ sku: view.sku, name: view.name, price: view.price }),
    );
    return view;
  }

  async changePrice(sku: string, newPrice: number): Promise<ProductView> {
    const price = requirePrice(newPrice);
    const [row] = await this.db
      .update(product)
      .set({ price: price.toFixed(2) })
      .where(eq(product.sku, sku))
      .returning();
    if (!row) throw new NotFoundException(`Product ${sku} not found`);
    const view = toView(row);
    this.eventBus.publish(new PriceChanged({ sku, price: view.price }));
    return view;
  }

  async discontinue(sku: string): Promise<ProductView> {
    const [row] = await this.db
      .update(product)
      .set({ available: false })
      .where(eq(product.sku, sku))
      .returning();
    if (!row) throw new NotFoundException(`Product ${sku} not found`);
    this.eventBus.publish(new ProductDiscontinued({ sku }));
    return toView(row);
  }
}
