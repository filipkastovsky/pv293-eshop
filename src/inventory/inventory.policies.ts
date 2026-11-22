import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { OrderCancelled, OrderPlaced } from '../contracts';
import { ChaosService } from '../platform';
import { InventoryService } from './inventory.service';

@EventsHandler(OrderPlaced)
export class ReserveStockPolicy implements IEventHandler<OrderPlaced> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly inventory: InventoryService,
  ) {}

  async handle(event: OrderPlaced): Promise<void> {
    this.chaos.maybeFail('ReserveStockPolicy');
    await this.inventory.reserve(event.orderId, event.lines);
  }
}

@EventsHandler(OrderCancelled)
export class ReleaseStockPolicy implements IEventHandler<OrderCancelled> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly inventory: InventoryService,
  ) {}

  async handle(event: OrderCancelled): Promise<void> {
    this.chaos.maybeFail('ReleaseStockPolicy');
    await this.inventory.release(event.orderId);
  }
}
