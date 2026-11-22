import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { InventoryService, StockLevel } from './inventory.service';

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(): Promise<StockLevel[]> {
    return this.inventory.list();
  }

  @Post(':sku/receive')
  receive(
    @Param('sku') sku: string,
    @Body() body: { quantity?: unknown },
  ): Promise<StockLevel> {
    return this.inventory.receive(sku, body?.quantity);
  }
}
