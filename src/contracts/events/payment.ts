import { OrderEvent } from '../domain-event';

export class PaymentInitiated extends OrderEvent {
  static readonly fields = ['orderId', 'paymentId', 'amount'] as const;
  declare readonly orderId: string;
  declare readonly paymentId: string;
  declare readonly amount: number;
}

export class PaymentSucceeded extends OrderEvent {
  static readonly fields = ['orderId', 'paymentId'] as const;
  declare readonly orderId: string;
  declare readonly paymentId: string;
}

export class PaymentFailed extends OrderEvent {
  static readonly fields = ['orderId', 'paymentId', 'reason'] as const;
  declare readonly orderId: string;
  declare readonly paymentId: string;
  declare readonly reason: string;
}
