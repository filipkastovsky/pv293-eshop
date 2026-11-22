import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { HealthController } from './health.controller';
import { PlatformModule } from './platform';

@Module({
  imports: [PlatformModule.register(), CatalogModule],
  controllers: [HealthController],
})
export class AppModule {}
