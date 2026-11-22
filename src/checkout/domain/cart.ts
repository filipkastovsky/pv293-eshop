import {
  CartCheckedOut,
  ItemAddedToCart,
  ItemRemovedFromCart,
  OrderLine,
  ProductView,
} from '../../contracts';
import { AggregateRoot } from './aggregate-root';
import { conflict, invalid, notFound } from './errors';

export type CartStatus = 'open' | 'checked_out';

export interface CartItem {
  sku: string;
  quantity: number;
}

export interface CartSnapshot {
  id: string;
  status: CartStatus;
  items: CartItem[];
  orderId: string | null;
  version: number;
}

const requireSellable = (sku: string, product: ProductView | null) => {
  if (!product) throw notFound(`Product ${sku} does not exist`);
  if (!product.available) throw conflict(`Product ${sku} is not available`);
  return product;
};

/**
 * Collects items until checkout. Prices are not kept in the cart: they are
 * asked from Catalog at checkout and frozen into the order lines.
 */
export class Cart extends AggregateRoot {
  private constructor(
    readonly id: string,
    private status: CartStatus,
    private readonly items: Map<string, number>,
    private orderIdValue: string | null,
    version: number,
  ) {
    super(version);
  }

  static open(id: string): Cart {
    return new Cart(id, 'open', new Map(), null, 0);
  }

  static restore(s: CartSnapshot): Cart {
    return new Cart(
      s.id,
      s.status,
      new Map(s.items.map((i) => [i.sku, i.quantity])),
      s.orderId,
      s.version,
    );
  }

  get orderId(): string | null {
    return this.orderIdValue;
  }

  get skus(): string[] {
    return [...this.items.keys()];
  }

  addItem(sku: string, quantity: number, product: ProductView | null): void {
    this.requireOpen();
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw invalid('quantity must be a positive integer');
    }
    requireSellable(sku, product);
    this.items.set(sku, (this.items.get(sku) ?? 0) + quantity);
    this.record(new ItemAddedToCart({ cartId: this.id, sku, quantity }));
  }

  removeItem(sku: string): void {
    this.requireOpen();
    if (!this.items.delete(sku)) {
      throw notFound(`Cart ${this.id} has no ${sku}`);
    }
    this.record(new ItemRemovedFromCart({ cartId: this.id, sku }));
  }

  /** Freezes the current prices into order lines and closes the cart. */
  checkOut(
    orderId: string,
    customerEmail: string,
    products: ReadonlyMap<string, ProductView | null>,
  ): void {
    this.requireOpen();
    if (typeof customerEmail !== 'string' || customerEmail.trim() === '') {
      throw invalid('customerEmail must be a non-empty string');
    }
    if (this.items.size === 0) throw conflict(`Cart ${this.id} is empty`);
    const lines: OrderLine[] = [...this.items].map(([sku, quantity]) => ({
      sku,
      quantity,
      unitPrice: requireSellable(sku, products.get(sku) ?? null).price,
    }));
    this.status = 'checked_out';
    this.orderIdValue = orderId;
    this.record(new CartCheckedOut({ cartId: this.id, customerEmail, lines }));
  }

  snapshot(): CartSnapshot {
    return {
      id: this.id,
      status: this.status,
      items: [...this.items].map(([sku, quantity]) => ({ sku, quantity })),
      orderId: this.orderIdValue,
      version: this.version,
    };
  }

  private requireOpen(): void {
    if (this.status !== 'open') {
      throw conflict(`Cart ${this.id} is already checked out`);
    }
  }
}
