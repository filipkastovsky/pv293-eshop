import { Injectable } from '@nestjs/common';
import { PaymentGateway } from './payment-gateway.port';

/** Instant fake provider: declines when the amount in cents ends in 13 (e.g. 120.13). */
@Injectable()
export class FakePaymentGateway extends PaymentGateway {
  async charge(
    _paymentId: string,
    amount: number,
  ): Promise<'succeeded' | 'declined'> {
    return Math.round(amount * 100) % 100 === 13 ? 'declined' : 'succeeded';
  }
}
