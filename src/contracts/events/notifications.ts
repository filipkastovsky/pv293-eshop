import { OrderEvent } from '../domain-event';

export class OrderSummarySent extends OrderEvent {
  static readonly fields = ['orderId'] as const;
  declare readonly orderId: string;
}

export class CancellationNoticeSent extends OrderEvent {
  static readonly fields = ['orderId'] as const;
  declare readonly orderId: string;
}
