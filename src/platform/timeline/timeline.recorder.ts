import { join } from 'node:path';
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus, UnhandledExceptionBus } from '@nestjs/cqrs';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { OrderEvent } from '../../contracts';
import { ChaosError } from '../chaos/chaos.service';
import { DB } from '../db/db.tokens';
import { migrateModule } from '../db/migrate-module';
import { failedHandler } from '../telemetry/handler-context';
import { scrubText } from '../telemetry/redact';
import { timeline } from './db/schema';

/** Projects every order-scoped event and every handler failure into `platform.timeline`. */
@Injectable()
export class TimelineRecorder implements OnModuleInit {
  private queue: Promise<void> = Promise.resolve();
  private readonly logger = new Logger(TimelineRecorder.name);

  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly eventBus: EventBus,
    private readonly exceptions: UnhandledExceptionBus,
  ) {}

  async onModuleInit(): Promise<void> {
    await migrateModule(this.db, {
      schema: 'platform',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });

    this.eventBus.subscribe((event) => {
      if (!(event instanceof OrderEvent)) return;
      void this.record({
        orderId: event.orderId,
        kind: 'event',
        name: event.constructor.name,
        payload: { ...event },
        at: new Date(event.occurredAt),
      });
    });

    this.exceptions.subscribe(({ exception, cause }) => {
      if (!(cause instanceof OrderEvent)) return;
      const error = exception instanceof Error ? exception : undefined;
      void this.record({
        orderId: cause.orderId,
        kind: 'handler_failed',
        name:
          failedHandler(exception) ??
          (exception instanceof ChaosError ? exception.handler : 'unknown'),
        payload: {
          error: scrubText(error?.message ?? String(exception)),
          event: cause.constructor.name,
        },
        at: new Date(),
      });
    });
  }

  /** Inserts run one at a time so `seq` follows bus arrival order. */
  private record(row: typeof timeline.$inferInsert): Promise<void> {
    this.queue = this.queue.then(async () => {
      try {
        // Platform plumbing: keep its pg spans out of the order's trace.
        // The query builder is lazy: it must run (be awaited) inside the callback, or the
        // insert would execute outside the suppressed context.
        await context.with(suppressTracing(context.active()), async () => {
          await this.db.insert(timeline).values(row);
        });
      } catch (err) {
        this.logger.error('Failed to record timeline entry', err);
      }
    });
    return this.queue;
  }
}
