import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import {
  CartCheckedOut,
  PaymentSucceeded,
  StockReservationFailed,
} from '../../contracts';
import { ChaosService } from '../../platform';
import { CancelOrder, CreateOrder, MarkOrderPaid } from './commands';

// Each policy turns one event into one of Checkout's own commands.

@EventsHandler(CartCheckedOut)
export class CreateOrderPolicy implements IEventHandler<CartCheckedOut> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly commands: CommandBus,
  ) {}

  async handle(event: CartCheckedOut): Promise<void> {
    this.chaos.maybeFail('CreateOrderPolicy');
    await this.commands.execute(
      new CreateOrder(event.cartId, event.customerEmail, event.lines),
    );
  }
}

@EventsHandler(PaymentSucceeded)
export class MarkOrderPaidPolicy implements IEventHandler<PaymentSucceeded> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly commands: CommandBus,
  ) {}

  async handle(event: PaymentSucceeded): Promise<void> {
    this.chaos.maybeFail('MarkOrderPaidPolicy');
    await this.commands.execute(new MarkOrderPaid(event.orderId));
  }
}

@EventsHandler(StockReservationFailed)
export class CancelOrderPolicy
  implements IEventHandler<StockReservationFailed>
{
  constructor(
    private readonly chaos: ChaosService,
    private readonly commands: CommandBus,
  ) {}

  async handle(event: StockReservationFailed): Promise<void> {
    this.chaos.maybeFail('CancelOrderPolicy');
    await this.commands.execute(
      new CancelOrder(event.orderId, `Out of stock: ${event.sku}`),
    );
  }
}
