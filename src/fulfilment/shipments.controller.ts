import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB } from '../platform';
import { shipment } from './db/schema';

@Controller('shipments')
export class ShipmentsController {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  @Get(':orderId')
  async find(@Param('orderId') orderId: string) {
    const [row] = await this.db
      .select({
        orderId: shipment.orderId,
        shipmentId: shipment.shipmentId,
        status: shipment.status,
      })
      .from(shipment)
      .where(eq(shipment.orderId, orderId));
    if (!row) throw new NotFoundException(`No shipment for order ${orderId}`);
    return row;
  }
}
