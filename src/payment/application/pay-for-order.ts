import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { QueryBus, QueryHandlerNotFoundException } from '@nestjs/cqrs';
import {
  GetOrderSummary,
  OrderSummary,
  PaymentFailed,
  PaymentInitiated,
  PaymentSucceeded,
} from '../../contracts';
import { PaymentGateway } from '../adapters/gateway/payment-gateway.port';
import { Payment } from '../domain/payment';
import { OutboxRelay } from '../outbox/outbox.relay';
import { PaymentRepository } from './payment.repository';

/** Pay for a placed order. Events leave only through the outbox, never straight to the bus. */
@Injectable()
export class PayForOrder {
  constructor(
    private readonly queries: QueryBus,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly relay: OutboxRelay,
  ) {}

  async execute(orderId: string): Promise<void> {
    const summary = await this.findOrder(orderId);
    if (summary?.status !== 'placed') {
      throw new ConflictException(`Order ${orderId} cannot be paid`);
    }

    const payment = Payment.initiate(randomUUID(), orderId, summary.total);
    await this.payments.saveInitiated(
      payment,
      new PaymentInitiated({
        orderId,
        paymentId: payment.id,
        amount: payment.amount,
      }),
    );
    this.relay.nudge();

    // Outside any transaction: the provider call may be slow.
    const answer = await this.gateway.charge(payment.id, payment.amount);

    if (answer === 'succeeded') {
      payment.succeed();
      await this.payments.saveOutcome(
        payment,
        new PaymentSucceeded({ orderId, paymentId: payment.id }),
      );
    } else {
      payment.fail('declined');
      await this.payments.saveOutcome(
        payment,
        new PaymentFailed({
          orderId,
          paymentId: payment.id,
          reason: 'declined',
        }),
      );
    }
    this.relay.nudge();
  }

  /** Checkout may not be there yet; no answer counts as an unknown order. */
  private async findOrder(orderId: string): Promise<OrderSummary | null> {
    try {
      return await this.queries.execute(new GetOrderSummary(orderId));
    } catch (err) {
      if (err instanceof QueryHandlerNotFoundException) return null;
      throw err;
    }
  }
}
