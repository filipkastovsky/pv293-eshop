import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { CartCheckedOut } from '../../contracts';
import { ChaosService } from '../../platform';
import { CreateOrder } from './create-order';

/** When a cart is checked out, create its order. */
@EventsHandler(CartCheckedOut)
export class CreateOrderPolicy implements IEventHandler<CartCheckedOut> {
  constructor(
    private readonly chaos: ChaosService,
    private readonly createOrder: CreateOrder,
  ) {}

  async handle(event: CartCheckedOut): Promise<void> {
    this.chaos.maybeFail('CreateOrderPolicy');
    await this.createOrder.execute({
      cartId: event.cartId,
      customerEmail: event.customerEmail,
      lines: event.lines,
    });
  }
}
