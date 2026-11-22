import { DomainEvent, OrderEvent } from '../domain-event';

export class StockReceived extends DomainEvent {
  static readonly fields = ['sku', 'quantity'] as const;
  declare readonly sku: string;
  declare readonly quantity: number;
}

export class StockReserved extends OrderEvent {
  static readonly fields = ['orderId'] as const;
  declare readonly orderId: string;
}

export class StockReservationFailed extends OrderEvent {
  static readonly fields = ['orderId', 'sku'] as const;
  declare readonly orderId: string;
  declare readonly sku: string;
}

export class StockReleased extends OrderEvent {
  static readonly fields = ['orderId'] as const;
  declare readonly orderId: string;
}
