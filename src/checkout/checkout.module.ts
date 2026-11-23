import { Module } from '@nestjs/common';
import { CancelOrderPolicy } from './application/cancel-order.policy';
import { CartService } from './application/cart.service';
import { CreateOrderPolicy } from './application/create-order.policy';
import { GetOrderSummaryHandler } from './application/get-order-summary.handler';
import { MarkOrderPaidPolicy } from './application/mark-order-paid.policy';
import { OrderService } from './application/order.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutStore } from './db/checkout-store';

@Module({
  controllers: [CheckoutController],
  providers: [
    CancelOrderPolicy,
    CartService,
    CheckoutStore,
    CreateOrderPolicy,
    GetOrderSummaryHandler,
    MarkOrderPaidPolicy,
    OrderService,
  ],
})
export class CheckoutModule {}
