import { join } from 'node:path';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB, migrateModule } from '../platform';
import { message } from './db/schema';

export type Kind = 'order_summary' | 'cancellation_notice';

/** Fake email: "sending" means storing the message in our own schema. */
@Injectable()
export class EmailService implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  async onModuleInit() {
    await migrateModule(this.db, {
      schema: 'notifications',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });
  }

  async send(m: {
    kind: Kind;
    orderId: string;
    to: string | null;
    subject: string;
    body: string;
  }) {
    const [row] = await this.db.insert(message).values(m).returning();
    return row;
  }

  /** Who got the order summary: the only address we know for an order. */
  async recipientOf(orderId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ to: message.to })
      .from(message)
      .where(
        and(eq(message.orderId, orderId), eq(message.kind, 'order_summary')),
      )
      .limit(1);
    return row?.to ?? null;
  }

  list() {
    return this.db
      .select()
      .from(message)
      .orderBy(desc(message.sentAt), desc(message.id));
  }
}
