import { join } from 'node:path';
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB, migrateModule } from '../platform';
import {
  AddItemToCartHandler,
  CheckOutCartHandler,
  RemoveItemFromCartHandler,
} from './application/cart.handlers';
import { GetOrderSummaryHandler } from './application/get-order-summary.handler';
import {
  CancelOrderHandler,
  CreateOrderHandler,
  MarkOrderPaidHandler,
  PlaceOrderHandler,
} from './application/order.handlers';
import {
  CancelOrderPolicy,
  CreateOrderPolicy,
  MarkOrderPaidPolicy,
} from './application/policies';
import { CheckoutController } from './http/checkout.controller';
import { CartRepository } from './infrastructure/cart.repository';
import { OrderRepository } from './infrastructure/order.repository';

/** Domain model: Cart and Order aggregates behind command handlers (see README.md). */
@Module({
  controllers: [CheckoutController],
  providers: [
    CartRepository,
    OrderRepository,
    AddItemToCartHandler,
    RemoveItemFromCartHandler,
    CheckOutCartHandler,
    CreateOrderHandler,
    PlaceOrderHandler,
    MarkOrderPaidHandler,
    CancelOrderHandler,
    CreateOrderPolicy,
    MarkOrderPaidPolicy,
    CancelOrderPolicy,
    GetOrderSummaryHandler,
  ],
})
export class CheckoutModule implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: NodePgDatabase) {}

  async onModuleInit(): Promise<void> {
    await migrateModule(this.db, {
      schema: 'checkout',
      migrationsFolder: join(__dirname, 'db', 'migrations'),
    });
  }
}
