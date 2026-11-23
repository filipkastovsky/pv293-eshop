import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { eventFromJson } from '../../contracts';
import { linkFrom } from '../../platform';
import { OutboxRepository } from './outbox.repository';

type OutboxRow = Awaited<
  ReturnType<OutboxRepository['findUnpublished']>
>[number];

const TRACER = 'pv293-eshop/outbox';
const POLL_MS = 500;
const BATCH = 100;

/**
 * Publishes outbox rows on the EventBus, oldest first, then marks them published.
 * At-least-once: a crash between publish and mark republishes the row on restart.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private rerun = false;
  private stopped = false;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly eventBus: EventBus,
  ) {}

  // After every module's onModuleInit, so our migrations have run.
  onApplicationBootstrap(): void {
    this.timer = setInterval(() => this.nudge(), POLL_MS);
    this.nudge();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearInterval(this.timer);
    while (this.running) await this.running;
  }

  /** Run now; if a run is in progress, run once more right after it. */
  nudge(): void {
    if (this.stopped) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    this.running = this.drain().finally(() => {
      this.running = undefined;
      if (this.rerun) {
        this.rerun = false;
        this.nudge();
      }
    });
  }

  /**
   * One row = one new root span, linked (not parented) to the request that wrote the row: the
   * relay runs seconds later, outside any request. Publish and mark happen inside it.
   */
  private relay(row: OutboxRow): Promise<void> {
    return trace.getTracer(TRACER).startActiveSpan(
      `outbox.relay ${row.eventName}`,
      {
        root: true,
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'nestjs-cqrs',
          'messaging.destination.name': row.eventName,
          'messaging.operation.type': 'receive',
          'messaging.operation.name': 'outbox.relay',
        },
        links: linkFrom(row.traceContext),
      },
      async (span) => {
        try {
          this.eventBus.publish(eventFromJson(row.eventName, row.payload));
          await this.outbox.markPublished(row.id);
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  private async drain(): Promise<void> {
    try {
      for (;;) {
        const rows = await this.outbox.findUnpublished(BATCH);
        for (const row of rows) {
          await this.relay(row);
        }
        if (rows.length < BATCH) return;
      }
    } catch (err) {
      // Stop here to keep order; the next poll retries from the same row.
      this.logger.error('Outbox relay run failed', err);
    }
  }
}
