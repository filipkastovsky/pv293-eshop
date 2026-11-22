import { EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { CancellationNoticeSent, OrderCancelled } from '../contracts';
import { ChaosService } from '../platform';
import { EmailService } from './email.service';

/**
 * When an order is cancelled, tell the customer. OrderCancelled carries no
 * email, so we reuse the address from the summary we sent earlier; if we never
 * saw the order, the notice is stored with `to = null`.
 */
@EventsHandler(OrderCancelled)
export class SendCancellationNoticePolicy
  implements IEventHandler<OrderCancelled>
{
  constructor(
    private readonly chaos: ChaosService,
    private readonly email: EmailService,
    private readonly eventBus: EventBus,
  ) {}

  async handle(event: OrderCancelled) {
    this.chaos.maybeFail('SendCancellationNoticePolicy');
    const sent = await this.email.send({
      kind: 'cancellation_notice',
      orderId: event.orderId,
      to: await this.email.recipientOf(event.orderId),
      subject: `Order ${event.orderId} cancelled`,
      body: `Your order was cancelled: ${event.reason}`,
    });
    this.eventBus.publish(
      new CancellationNoticeSent({ orderId: sent.orderId }),
    );
  }
}
