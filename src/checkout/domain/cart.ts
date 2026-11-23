import { CheckoutConflict } from './checkout-conflict';

export interface CartItem {
  readonly sku: string;
  readonly quantity: number;
}

export class Cart {
  constructor(
    readonly id: string,
    private currentItems: readonly CartItem[],
    private closed: boolean,
  ) {}

  get items(): readonly CartItem[] {
    return this.currentItems;
  }

  get checkedOut(): boolean {
    return this.closed;
  }

  hasSameItems(other: Cart): boolean {
    return this.items.length === other.items.length && this.items.every(
      ({ sku, quantity }, index) =>
        other.items[index].sku === sku && other.items[index].quantity === quantity,
    );
  }

  addItem(sku: string, quantity: number): void {
    this.requireOpen();
    const existing = this.currentItems.find((item) => item.sku === sku);
    const newQuantity = (existing?.quantity ?? 0) + quantity;
    if (!Number.isSafeInteger(newQuantity)) {
      throw new CheckoutConflict('Cart item quantity is too large');
    }
    const item = { sku, quantity: newQuantity };
    this.currentItems = existing
      ? this.currentItems.map((current) => (current === existing ? item : current))
      : [...this.currentItems, item];
  }

  removeItem(sku: string): boolean {
    this.requireOpen();
    const remaining = this.currentItems.filter((item) => item.sku !== sku);
    if (remaining.length === this.currentItems.length) return false;
    this.currentItems = remaining;
    return true;
  }

  checkOut(): void {
    this.requireOpen();
    if (this.currentItems.length === 0) {
      throw new CheckoutConflict('Cannot check out an empty cart');
    }
    this.closed = true;
  }

  private requireOpen(): void {
    if (this.closed) throw new CheckoutConflict('Cart is already checked out');
  }
}
