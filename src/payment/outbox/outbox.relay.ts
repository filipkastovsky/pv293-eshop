import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import { eventFromJson } from '../../contracts';
import { OutboxRepository } from './outbox.repository';

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
    clearInterval(this.timer);
    await this.running;
  }

  /** Run now; if a run is in progress, run once more right after it. */
  nudge(): void {
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

  private async drain(): Promise<void> {
    try {
      for (;;) {
        const rows = await this.outbox.findUnpublished(BATCH);
        for (const row of rows) {
          this.eventBus.publish(eventFromJson(row.eventName, row.payload));
          await this.outbox.markPublished(row.id);
        }
        if (rows.length < BATCH) return;
      }
    } catch (err) {
      // Stop here to keep order; the next poll retries from the same row.
      this.logger.error('Outbox relay run failed', err);
    }
  }
}
