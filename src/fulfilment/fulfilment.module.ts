import { join } from 'node:path';
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB, migrateModule } from '../platform';
import { PackOrderPolicy } from './pack-order.policy';
import { ShipmentsController } from './shipments.controller';

/** A single event reaction plus a table (see README.md). */
@Module({
  controllers: [ShipmentsController],
  providers: [PackOrderPolicy],
})
export class FulfilmentModule implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  async onModuleInit(): Promise<void> {
    await migrateModule(this.db, {
      schema: 'fulfilment',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });
  }
}
