import { join } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  DomainEvent,
  OrderLine,
  StockReceived,
  StockReleased,
  StockReservationFailed,
  StockReserved,
} from '../contracts';
import { DB, migrateModule } from '../platform';
import { ReservedLine, reservation, stock } from './db/schema';

export interface StockLevel {
  sku: string;
  onHand: number;
  reserved: number;
}

/** Same SKU on two lines counts once, with the summed quantity. */
const perSku = (lines: readonly OrderLine[]): ReservedLine[] => {
  const totals = new Map<string, number>();
  for (const l of lines)
    totals.set(l.sku, (totals.get(l.sku) ?? 0) + l.quantity);
  return [...totals]
    .map(([sku, quantity]) => ({ sku, quantity }))
    .sort((a, b) => a.sku.localeCompare(b.sku));
};

/**
 * The whole module as transaction scripts: each public method is one use
 * case, one database transaction, then the resulting event is published.
 */
@Injectable()
export class InventoryService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly eventBus: EventBus,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrateModule(this.db, {
      schema: 'inventory',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });
  }

  async list(): Promise<StockLevel[]> {
    return this.db
      .select({
        sku: stock.sku,
        onHand: stock.onHand,
        reserved: stock.reserved,
      })
      .from(stock)
      .orderBy(asc(stock.sku));
  }

  async receive(sku: string, quantity: unknown): Promise<StockLevel> {
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new BadRequestException('quantity must be a positive integer');
    }
    const [row] = await this.db
      .insert(stock)
      .values({ sku, onHand: quantity })
      .onConflictDoUpdate({
        target: stock.sku,
        set: { onHand: sql`${stock.onHand} + ${quantity}` },
      })
      .returning();
    this.eventBus.publish(new StockReceived({ sku, quantity }));
    return { sku: row.sku, onHand: row.onHand, reserved: row.reserved };
  }

  /**
   * All lines or nothing. The reservation row is claimed first: a second
   * OrderPlaced for the same order finds it taken and does nothing.
   */
  async reserve(orderId: string, lines: readonly OrderLine[]): Promise<void> {
    const wanted = perSku(lines);
    const event = await this.db.transaction(
      async (tx): Promise<DomainEvent | null> => {
        const claimed = await tx
          .insert(reservation)
          .values({ orderId, status: 'reserved', lines: wanted })
          .onConflictDoNothing()
          .returning({ orderId: reservation.orderId });
        if (claimed.length === 0) return null; // seen this order before

        // Lock the rows in SKU order so two reservations cannot deadlock.
        const rows = wanted.length
          ? await tx
              .select()
              .from(stock)
              .where(
                inArray(
                  stock.sku,
                  wanted.map((l) => l.sku),
                ),
              )
              .orderBy(asc(stock.sku))
              .for('update')
          : [];
        const available = new Map(
          rows.map((r) => [r.sku, r.onHand - r.reserved]),
        );
        const short = wanted.find(
          (l) => (available.get(l.sku) ?? 0) < l.quantity,
        );
        if (short) {
          await tx
            .update(reservation)
            .set({ status: 'failed' })
            .where(eq(reservation.orderId, orderId));
          return new StockReservationFailed({ orderId, sku: short.sku });
        }
        for (const l of wanted) {
          await tx
            .update(stock)
            .set({ reserved: sql`${stock.reserved} + ${l.quantity}` })
            .where(eq(stock.sku, l.sku));
        }
        return new StockReserved({ orderId });
      },
    );
    if (event) this.eventBus.publish(event);
  }

  /**
   * Gives back what this order holds. Nothing held (reservation failed,
   * already released) means nothing to release and no event. An order
   * cancelled before we saw it is remembered, so a late OrderPlaced is ignored.
   */
  async release(orderId: string): Promise<void> {
    const released = await this.db.transaction(async (tx) => {
      const [held] = await tx
        .select()
        .from(reservation)
        .where(eq(reservation.orderId, orderId))
        .for('update');
      if (!held) {
        await tx
          .insert(reservation)
          .values({ orderId, status: 'released', lines: [] })
          .onConflictDoNothing();
        return false;
      }
      if (held.status !== 'reserved') return false;
      for (const l of held.lines) {
        await tx
          .update(stock)
          .set({ reserved: sql`${stock.reserved} - ${l.quantity}` })
          .where(eq(stock.sku, l.sku));
      }
      await tx
        .update(reservation)
        .set({ status: 'released' })
        .where(eq(reservation.orderId, orderId));
      return true;
    });
    if (released) this.eventBus.publish(new StockReleased({ orderId }));
  }
}
