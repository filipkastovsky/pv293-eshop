import { Command } from '@nestjs/cqrs';
import { OrderLine } from '../../contracts';

// Checkout's own commands. They never leave this module: other modules make
// Checkout act only by publishing events that a Checkout policy reacts to.

export class AddItemToCart extends Command<void> {
  constructor(
    readonly cartId: string,
    readonly sku: string,
    readonly quantity: number,
  ) {
    super();
  }
}

export class RemoveItemFromCart extends Command<void> {
  constructor(
    readonly cartId: string,
    readonly sku: string,
  ) {
    super();
  }
}

/** Resolves to the id of the order the checkout will create. */
export class CheckOutCart extends Command<string> {
  constructor(
    readonly cartId: string,
    readonly customerEmail: string,
  ) {
    super();
  }
}

export class CreateOrder extends Command<void> {
  constructor(
    readonly cartId: string,
    readonly customerEmail: string,
    readonly lines: OrderLine[],
  ) {
    super();
  }
}

export class PlaceOrder extends Command<void> {
  constructor(readonly orderId: string) {
    super();
  }
}

export class MarkOrderPaid extends Command<void> {
  constructor(readonly orderId: string) {
    super();
  }
}

export class CancelOrder extends Command<void> {
  constructor(
    readonly orderId: string,
    readonly reason: string,
  ) {
    super();
  }
}
