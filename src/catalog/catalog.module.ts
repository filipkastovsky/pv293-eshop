import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { GetProductHandler } from './get-product.handler';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService, GetProductHandler],
})
export class CatalogModule {}
