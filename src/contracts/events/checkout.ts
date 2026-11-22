import { DomainEvent, OrderEvent, type OrderLine } from '../domain-event';

export class ItemAddedToCart extends DomainEvent {
  static readonly fields = ['cartId', 'sku', 'quantity'] as const;
  declare readonly cartId: string;
  declare readonly sku: string;
  declare readonly quantity: number;
}

export class ItemRemovedFromCart extends DomainEvent {
  static readonly fields = ['cartId', 'sku'] as const;
  declare readonly cartId: string;
  declare readonly sku: string;
}

export class CartCheckedOut extends DomainEvent {
  static readonly fields = ['cartId', 'customerEmail', 'lines'] as const;
  declare readonly cartId: string;
  declare readonly customerEmail: string;
  declare readonly lines: OrderLine[];
}

export class OrderCreated extends OrderEvent {
  static readonly fields = ['orderId', 'cartId'] as const;
  declare readonly orderId: string;
  declare readonly cartId: string;
}

export class OrderPlaced extends OrderEvent {
  static readonly fields = [
    'orderId',
    'customerEmail',
    'lines',
    'total',
  ] as const;
  declare readonly orderId: string;
  declare readonly customerEmail: string;
  declare readonly lines: OrderLine[];
  declare readonly total: number;
}

export class OrderPaid extends OrderEvent {
  static readonly fields = ['orderId'] as const;
  declare readonly orderId: string;
}

export class OrderCancelled extends OrderEvent {
  static readonly fields = ['orderId', 'reason'] as const;
  declare readonly orderId: string;
  declare readonly reason: string;
}
