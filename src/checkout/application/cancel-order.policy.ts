import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { StockReservationFailed } from '../../contracts';
import { ChaosService } from '../../platform';
import { CancelOrder } from './cancel-order';

/** When stock cannot be reserved, cancel the order. */
@EventsHandler(StockReservationFailed)
export class CancelOrderPolicy
  implements IEventHandler<StockReservationFailed>
{
  constructor(
    private readonly chaos: ChaosService,
    private readonly cancelOrder: CancelOrder,
  ) {}

  async handle(event: StockReservationFailed): Promise<void> {
    this.chaos.maybeFail('CancelOrderPolicy');
    await this.cancelOrder.execute(event.orderId, `out of stock: ${event.sku}`);
  }
}
