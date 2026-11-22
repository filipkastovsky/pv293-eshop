import { Query } from '@nestjs/cqrs';

export interface ProductView {
  sku: string;
  name: string;
  price: number;
  available: boolean;
}

/** Answered by Catalog. Resolves to null for an unknown sku. */
export class GetProduct extends Query<ProductView | null> {
  constructor(public readonly sku: string) {
    super();
  }
}
