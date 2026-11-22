import { join } from 'node:path';
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB, migrateModule } from '../platform';
import { DrizzlePaymentRepository } from './adapters/db/drizzle-payment.repository';
import { FakePaymentGateway } from './adapters/gateway/fake-payment-gateway';
import { PaymentGateway } from './adapters/gateway/payment-gateway.port';
import { PaymentController } from './adapters/http/payment.controller';
import { PayForOrder } from './application/pay-for-order';
import { PaymentRepository } from './application/payment.repository';
import { OutboxRelay } from './outbox/outbox.relay';
import { OutboxRepository } from './outbox/outbox.repository';

@Module({
  controllers: [PaymentController],
  providers: [
    PayForOrder,
    OutboxRepository,
    OutboxRelay,
    { provide: PaymentRepository, useClass: DrizzlePaymentRepository },
    { provide: PaymentGateway, useClass: FakePaymentGateway },
  ],
})
export class PaymentModule implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  async onModuleInit(): Promise<void> {
    await migrateModule(this.db, {
      schema: 'payment',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });
  }
}
