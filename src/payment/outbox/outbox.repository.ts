import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { DomainEvent } from '../../contracts';
import { DB } from '../../platform';
import { outbox } from '../db/schema';

/** Anything that can insert: the pool, or a transaction handed in by the caller. */
export type Writer = Pick<NodePgDatabase, 'insert'>;

@Injectable()
export class OutboxRepository {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  /** Pass the caller's transaction so the row commits or rolls back with the state change. */
  async add(tx: Writer, event: DomainEvent): Promise<void> {
    await tx.insert(outbox).values({
      eventName: event.constructor.name,
      payload: { ...event },
    });
  }

  findUnpublished(limit: number) {
    return this.db
      .select()
      .from(outbox)
      .where(isNull(outbox.publishedAt))
      .orderBy(asc(outbox.createdAt), asc(outbox.seq))
      .limit(limit);
  }

  async markPublished(id: string): Promise<void> {
    await this.db
      .update(outbox)
      .set({ publishedAt: new Date() })
      .where(and(eq(outbox.id, id), isNull(outbox.publishedAt)));
  }
}
