import { Controller, Get, Inject, Param } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../db/db.tokens';
import { timeline } from './db/schema';

@Controller('orders')
export class TimelineController {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  @Get(':orderId/timeline')
  async get(@Param('orderId') orderId: string) {
    const rows = await this.db
      .select()
      .from(timeline)
      .where(eq(timeline.orderId, orderId))
      .orderBy(asc(timeline.at));
    return {
      orderId,
      entries: rows.map((r) => ({
        at: r.at.toISOString(),
        kind: r.kind,
        name: r.name,
        payload: r.payload,
      })),
    };
  }
}
