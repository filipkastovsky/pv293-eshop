import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { PayForOrder } from '../../application/pay-for-order';

@Controller('orders/:orderId/pay')
export class PaymentController {
  constructor(private readonly payForOrder: PayForOrder) {}

  @Post()
  @HttpCode(202)
  async pay(@Param('orderId') orderId: string): Promise<void> {
    await this.payForOrder.execute(orderId);
  }
}
