import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PaymentSucceeded } from '../../contracts';
import { ChaosService } from '../../platform';
import { MarkOrderPaid } from './mark-order-paid';

/** When a payment succeeds, mark its order paid. */
@EventsHandler(PaymentSucceeded)
export class MarkOrderPaidPolicy implements IEventHandler<PaymentSucceeded> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly markOrderPaid: MarkOrderPaid,
  ) {}

  async handle(event: PaymentSucceeded): Promise<void> {
    this.chaos.maybeFail('MarkOrderPaidPolicy');
    await this.markOrderPaid.execute(event.orderId, event.paymentId);
  }
}
