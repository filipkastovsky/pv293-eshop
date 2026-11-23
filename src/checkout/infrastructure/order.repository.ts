import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../../platform';
import { events } from '../db/schema';
import { Order, OrderHistoryEvent } from '../domain/order';
import { EventLog } from './event-log';

/** Someone else appended to the stream since it was loaded. */
export class OrderConcurrencyError extends Error {
  constructor(orderId: string) {
    super(`Order ${orderId} was changed concurrently`);
    this.name = 'OrderConcurrencyError';
  }
}

const MAX_ATTEMPTS = 3;

const isUniqueViolation = (err: unknown): boolean =>
  ((err as { code?: string }).code ??
    (err as { cause?: { code?: string } }).cause?.code) === '23505';

/** Orders are their event streams: load = replay, save = append. */
@Injectable()
export class OrderRepository {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly log: EventLog,
  ) {}

  async load(orderId: string): Promise<Order | null> {
    const rows = await this.db
      .select({ name: events.name, payload: events.payload })
      .from(events)
      .where(and(eq(events.streamType, 'order'), eq(events.streamId, orderId)))
      .orderBy(asc(events.version));
    if (rows.length === 0) return null;
    return Order.fromHistory(
      orderId,
      rows.map(
        (r) =>
          ({ ...(r.payload as object), type: r.name }) as OrderHistoryEvent,
      ),
    );
  }

  /** Appends the order's pending events after the version it was loaded at, then publishes them. */
  async save(order: Order): Promise<void> {
    const pending = order.pendingEvents;
    if (pending.length === 0) return;
    let logged: Awaited<ReturnType<EventLog['append']>>;
    try {
      // One multi-row insert: all of the events are appended, or none.
      logged = await this.log.append(
        this.db,
        pending.map(({ type, ...payload }, i) => ({
          streamType: 'order',
          streamId: order.id,
          version: order.version + i + 1,
          name: type,
          payload,
        })),
      );
    } catch (err) {
      if (isUniqueViolation(err)) throw new OrderConcurrencyError(order.id);
      throw err;
    }
    await this.log.publish(logged);
  }

  /**
   * Load, change, save. When another writer appended in between, reload and run `change` again
   * on the newer state. Resolves to null for an unknown order.
   */
  async change(
    orderId: string,
    change: (order: Order) => void,
  ): Promise<Order | null> {
    for (let attempt = 1; ; attempt++) {
      const order = await this.load(orderId);
      if (!order) return null;
      change(order);
      try {
        await this.save(order);
        return order;
      } catch (err) {
        if (!(err instanceof OrderConcurrencyError) || attempt >= MAX_ATTEMPTS)
          throw err;
      }
    }
  }
}
