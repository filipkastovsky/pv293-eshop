import type {
  PaymentFailed,
  PaymentInitiated,
  PaymentSucceeded,
} from '../../contracts';
import type { Payment } from '../domain/payment';

/**
 * Persistence port. Each method saves the payment and the event describing the
 * change in one transaction, so an event can never be lost or invented.
 */
export abstract class PaymentRepository {
  abstract saveInitiated(
    payment: Payment,
    event: PaymentInitiated,
  ): Promise<void>;
  abstract saveOutcome(
    payment: Payment,
    event: PaymentSucceeded | PaymentFailed,
  ): Promise<void>;
}
