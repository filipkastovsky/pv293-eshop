import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { HealthController } from './health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentModule } from './payment/payment.module';
import { PlatformModule } from './platform';

@Module({
  imports: [
    PlatformModule.register(),
    CatalogModule,
    PaymentModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
