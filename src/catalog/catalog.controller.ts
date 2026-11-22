import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller('catalog/products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list() {
    return this.catalog.list();
  }

  @Post()
  add(@Body() body: { sku: string; name: string; price: number }) {
    return this.catalog.add(body);
  }

  @Patch(':sku/price')
  changePrice(@Param('sku') sku: string, @Body() body: { price: number }) {
    return this.catalog.changePrice(sku, body.price);
  }

  @Post(':sku/discontinue')
  discontinue(@Param('sku') sku: string) {
    return this.catalog.discontinue(sku);
  }
}
