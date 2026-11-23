import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { PaymentSucceeded } from '../../contracts';
import { ChaosService } from '../../platform';
import { OrderService } from './order.service';

@EventsHandler(PaymentSucceeded)
export class MarkOrderPaidPolicy implements IEventHandler<PaymentSucceeded> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly orders: OrderService,
  ) {}

  handle(event: PaymentSucceeded): Promise<void> {
    this.chaos.maybeFail('MarkOrderPaidPolicy');
    return this.orders.markOrderPaid(event.orderId);
  }
}
