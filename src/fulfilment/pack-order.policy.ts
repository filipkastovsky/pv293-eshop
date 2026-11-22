import { randomUUID } from 'node:crypto';
import { Inject } from '@nestjs/common';
import { EventBus, EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { OrderPacked, OrderPaid } from '../contracts';
import { ChaosService, DB } from '../platform';
import { shipment } from './db/schema';

/**
 * The whole of Fulfilment's behaviour: a paid order gets packed. OrderPaid
 * carries everything needed (the order id), so we ask nobody.
 */
@EventsHandler(OrderPaid)
export class PackOrderPolicy implements IEventHandler<OrderPaid> {
  constructor(
    private readonly chaos: ChaosService,
    @Inject(DB) private readonly db: NodePgDatabase,
    private readonly eventBus: EventBus,
  ) {}

  async handle(event: OrderPaid): Promise<void> {
    this.chaos.maybeFail('PackOrderPolicy');
    const [packed] = await this.db
      .insert(shipment)
      .values({
        orderId: event.orderId,
        shipmentId: randomUUID(),
        status: 'packed',
      })
      .onConflictDoNothing({ target: shipment.orderId })
      .returning();
    if (!packed) return; // already packed: a duplicate OrderPaid
    this.eventBus.publish(
      new OrderPacked({
        orderId: packed.orderId,
        shipmentId: packed.shipmentId,
      }),
    );
  }
}
