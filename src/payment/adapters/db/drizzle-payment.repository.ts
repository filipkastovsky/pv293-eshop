import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type {
  PaymentFailed,
  PaymentInitiated,
  PaymentSucceeded,
} from '../../../contracts';
import { DB } from '../../../platform';
import { PaymentRepository } from '../../application/payment.repository';
import { payments } from '../../db/schema';
import type { Payment } from '../../domain/payment';
import { OutboxRepository } from '../../outbox/outbox.repository';

@Injectable()
export class DrizzlePaymentRepository extends PaymentRepository {
  constructor(
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly outbox: OutboxRepository,
  ) {
    super();
  }

  async saveInitiated(
    payment: Payment,
    event: PaymentInitiated,
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(payments).values({
          id: payment.id,
          orderId: payment.orderId,
          amount: payment.amount.toFixed(2),
          status: payment.status,
        });
        await this.outbox.add(tx, event);
      });
    } catch (err) {
      const code =
        (err as { code?: string }).code ??
        (err as { cause?: { code?: string } }).cause?.code;
      if (code === '23505') {
        throw new ConflictException(
          `Order ${payment.orderId} already has a payment in progress or paid`,
        );
      }
      throw err;
    }
  }

  async saveOutcome(
    payment: Payment,
    event: PaymentSucceeded | PaymentFailed,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: payment.status, failureReason: payment.failureReason })
        .where(eq(payments.id, payment.id));
      await this.outbox.add(tx, event);
    });
  }
}
