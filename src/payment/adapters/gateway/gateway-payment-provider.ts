import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '../../application/payment-provider';
import { PaymentGateway } from './payment-gateway.port';

/** The anti-corruption layer: calls the gateway and translates its answer to ours. */
@Injectable()
export class GatewayPaymentProvider extends PaymentProvider {
  constructor(private readonly gateway: PaymentGateway) {
    super();
  }

  async collect(
    paymentId: string,
    amount: number,
  ): Promise<'approved' | 'declined'> {
    const answer = await this.gateway.charge(paymentId, amount);
    return answer === 'succeeded' ? 'approved' : 'declined';
  }
}
