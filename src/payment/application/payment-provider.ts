/**
 * How the use case asks for money, in our language. Implemented by an anti-corruption
 * layer in `adapters/gateway/`; the external provider's vocabulary never reaches here.
 */
export abstract class PaymentProvider {
  abstract collect(
    paymentId: string,
    amount: number,
  ): Promise<'approved' | 'declined'>;
}
