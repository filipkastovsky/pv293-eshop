import { DomainEvent } from '../domain-event';

export class ProductAdded extends DomainEvent {
  static readonly fields = ['sku', 'name', 'price'] as const;
  declare readonly sku: string;
  declare readonly name: string;
  declare readonly price: number;
}

export class PriceChanged extends DomainEvent {
  static readonly fields = ['sku', 'price'] as const;
  declare readonly sku: string;
  declare readonly price: number;
}

export class ProductDiscontinued extends DomainEvent {
  static readonly fields = ['sku'] as const;
  declare readonly sku: string;
}
