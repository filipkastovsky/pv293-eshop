import { EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { OrderPlaced, OrderSummarySent } from '../contracts';
import { ChaosService } from '../platform';
import { EmailService } from './email.service';

/** When an order is placed, email the customer a summary. */
@EventsHandler(OrderPlaced)
export class SendOrderSummaryPolicy implements IEventHandler<OrderPlaced> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly email: EmailService,
    private readonly eventBus: EventBus,
  ) {}

  async handle(event: OrderPlaced) {
    this.chaos.maybeFail('SendOrderSummaryPolicy');
    const sent = await this.email.send({
      kind: 'order_summary',
      orderId: event.orderId,
      to: event.customerEmail,
      subject: `Order ${event.orderId} received`,
      body: `Thank you! Your order total is ${event.total}.`,
    });
    this.eventBus.publish(new OrderSummarySent({ orderId: sent.orderId }));
  }
}
