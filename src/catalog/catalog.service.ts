import { join } from 'node:path';
import {
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
    const inserted = await this.db
      .insert(product)
      .values({ ...input, price: input.price.toFixed(2) })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) {
      throw new ConflictException(`Product ${input.sku} already exists`);
    }
    this.eventBus.publish(new ProductAdded(input));
    return toView(inserted[0]);
  }

  async changePrice(sku: string, price: number): Promise<ProductView> {
    const [row] = await this.db
      .update(product)
      .set({ price: price.toFixed(2) })
      .where(eq(product.sku, sku))
      .returning();
    if (!row) throw new NotFoundException(`Product ${sku} not found`);
    this.eventBus.publish(new PriceChanged({ sku, price }));
    return toView(row);
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
