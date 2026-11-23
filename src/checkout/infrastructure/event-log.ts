import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { and, asc, inArray, isNull, lt, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eventFromJson } from '../../contracts';
import { DB } from '../../platform';
import { events } from '../db/schema';

/** The pool, or a transaction handed in by the caller. */
export type Writer = Pick<NodePgDatabase, 'insert'>;

export interface NewEvent {
  streamType: 'order' | 'cart';
  streamId: string;
  /** Position in an order stream; null for cart events, which are not replayed. */
  version: number | null;
  name: string;
  payload: Record<string, unknown>;
}

export interface LoggedEvent {
  seq: number;
  name: string;
  payload: unknown;
  recordedAt: Date;
}

const SWEEP_MS = 1_000;
/** Rows younger than this are still being published by the request that wrote them. */
const SWEEP_AFTER = sql`interval '5 seconds'`;
const BATCH = 100;

/**
 * Checkout's event log: the order event store and the outbox in one table.
 *
 * Writers `append` inside their transaction and `publish` right after it commits, so the event
 * leaves within the request that caused it. If the process dies in between, the sweeper
 * publishes the row a few seconds later: at least once, never lost.
 */
@Injectable()
export class EventLog implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventLog.name);
  private timer?: NodeJS.Timeout;
  private sweeping?: Promise<void>;
  private stopped = false;

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly eventBus: EventBus,
  ) {}

  append(tx: Writer, entries: NewEvent[]): Promise<LoggedEvent[]> {
    if (entries.length === 0) return Promise.resolve([]);
    return tx.insert(events).values(entries).returning({
      seq: events.seq,
      name: events.name,
      payload: events.payload,
      recordedAt: events.recordedAt,
    });
  }

  /** Call only after the transaction that appended `logged` has committed. */
  async publish(logged: LoggedEvent[]): Promise<void> {
    if (logged.length === 0) return;
    for (const e of logged) {
      this.eventBus.publish(
        eventFromJson(e.name, {
          occurredAt: e.recordedAt.toISOString(),
          ...(e.payload as object),
        }),
      );
    }
    await this.db
      .update(events)
      .set({ publishedAt: new Date() })
      .where(
        and(
          inArray(
            events.seq,
            logged.map((e) => e.seq),
          ),
          isNull(events.publishedAt),
        ),
      );
  }

  // After every module's onModuleInit, so the migrations have run.
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => this.sweep(), SWEEP_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    await this.sweeping;
  }

  private sweep(): void {
    if (this.stopped || this.sweeping) return;
    this.sweeping = this.sweepOnce().finally(() => {
      this.sweeping = undefined;
    });
  }

  private async sweepOnce(): Promise<void> {
    try {
      const stale = await this.db
        .select({
          seq: events.seq,
          name: events.name,
          payload: events.payload,
          recordedAt: events.recordedAt,
        })
        .from(events)
        .where(
          and(
            isNull(events.publishedAt),
            lt(events.recordedAt, sql`now() - ${SWEEP_AFTER}`),
          ),
        )
        .orderBy(asc(events.seq))
        .limit(BATCH);
      if (stale.length === 0) return;
      this.logger.warn('publishing events left unpublished', {
        count: stale.length,
      });
      await this.publish(stale);
    } catch (err) {
      this.logger.error('event sweep failed', err);
    }
  }
}
