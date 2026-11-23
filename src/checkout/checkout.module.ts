import { join } from 'node:path';
import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DB, migrateModule } from '../platform';
import { AddItemToCart } from './application/add-item-to-cart';
import { CancelOrder } from './application/cancel-order';
import { CancelOrderPolicy } from './application/cancel-order.policy';
import { CheckOutCart } from './application/check-out-cart';
import { CreateOrder } from './application/create-order';
import { CreateOrderPolicy } from './application/create-order.policy';
import { GetOrderSummaryHandler } from './application/get-order-summary.handler';
import { MarkOrderPaid } from './application/mark-order-paid';
import { MarkOrderPaidPolicy } from './application/mark-order-paid.policy';
import { PlaceOrder } from './application/place-order';
import { RemoveItemFromCart } from './application/remove-item-from-cart';
import { CartRepository } from './infrastructure/cart.repository';
import { EventLog } from './infrastructure/event-log';
import { CartsController } from './infrastructure/http/carts.controller';
import { OrdersController } from './infrastructure/http/orders.controller';
import { OrderRepository } from './infrastructure/order.repository';

@Module({
  controllers: [CartsController, OrdersController],
  providers: [
    EventLog,
    CartRepository,
    OrderRepository,
    AddItemToCart,
    RemoveItemFromCart,
    CheckOutCart,
    PlaceOrder,
    CreateOrder,
    MarkOrderPaid,
    CancelOrder,
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
