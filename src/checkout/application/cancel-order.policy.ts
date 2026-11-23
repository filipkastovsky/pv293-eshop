import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { StockReservationFailed } from '../../contracts';
import { ChaosService } from '../../platform';
import { OrderService } from './order.service';

@EventsHandler(StockReservationFailed)
export class CancelOrderPolicy
  implements IEventHandler<StockReservationFailed>
{
  constructor(
    private readonly chaos: ChaosService,
    private readonly orders: OrderService,
  ) {}

  handle(event: StockReservationFailed): Promise<void> {
    this.chaos.maybeFail('CancelOrderPolicy');
    return this.orders.cancelOrder(event.orderId);
  }
}
