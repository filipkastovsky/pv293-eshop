import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { CheckoutModule } from './checkout/checkout.module';
import { FulfilmentModule } from './fulfilment/fulfilment.module';
import { HealthController } from './health.controller';
import { InventoryModule } from './inventory/inventory.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentModule } from './payment/payment.module';
import { PlatformModule } from './platform';

@Module({
  imports: [
    PlatformModule.register(),
    CatalogModule,
    CheckoutModule,
    InventoryModule,
    FulfilmentModule,
    PaymentModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
