/**
 * Port to the external payment provider. This is the only place the provider's
 * vocabulary (`charge`, `succeeded`, `declined`) appears; the use case turns the
 * answer into our own `Payment` state and events.
 */
export abstract class PaymentGateway {
  abstract charge(
    paymentId: string,
    amount: number,
  ): Promise<'succeeded' | 'declined'>;
}
