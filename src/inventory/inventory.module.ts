import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { ReleaseStockPolicy, ReserveStockPolicy } from './inventory.policies';
import { InventoryService } from './inventory.service';

/** Transaction scripts in one service (see README.md). */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, ReserveStockPolicy, ReleaseStockPolicy],
})
export class InventoryModule {}
