import { Injectable } from '@nestjs/common';
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { notFound } from '../domain/errors';
import { Order } from '../domain/order';
import { CartRepository } from '../infrastructure/cart.repository';
import { retryOnConflict } from '../infrastructure/concurrency';
import { OrderRepository } from '../infrastructure/order.repository';
import {
  CancelOrder,
  CreateOrder,
  MarkOrderPaid,
  PlaceOrder,
} from './commands';

@CommandHandler(CreateOrder)
export class CreateOrderHandler implements ICommandHandler<CreateOrder> {
  constructor(
    private readonly carts: CartRepository,
    private readonly orders: OrderRepository,
    private readonly events: EventBus,
  ) {}

  /** The order id was fixed at checkout and kept on the cart. */
  async execute({ cartId, customerEmail, lines }: CreateOrder): Promise<void> {
    const cart = await this.carts.find(cartId);
    if (!cart?.orderId) throw notFound(`Cart ${cartId} was not checked out`);
    const orderId = cart.orderId;
    const order = await retryOnConflict(async () => {
      if (await this.orders.find(orderId)) return null; // already created
      const o = Order.create(orderId, cartId, customerEmail, lines);
      await this.orders.save(o);
      return o;
    });
    if (order) this.events.publishAll(order.pullEvents());
  }
}

/** Load the order, apply one transition, save, publish what it recorded. */
@Injectable()
abstract class OrderTransitionHandler<C extends { orderId: string }> {
  constructor(
    private readonly orders: OrderRepository,
    private readonly events: EventBus,
  ) {}

  protected abstract apply(order: Order, command: C): void;

  async execute(command: C): Promise<void> {
    const order = await retryOnConflict(async () => {
      const o = await this.orders.find(command.orderId);
      if (!o) throw notFound(`Order ${command.orderId} does not exist`);
      this.apply(o, command);
      await this.orders.save(o);
      return o;
    });
    this.events.publishAll(order.pullEvents());
  }
}

@CommandHandler(PlaceOrder)
export class PlaceOrderHandler extends OrderTransitionHandler<PlaceOrder> {
  protected apply(order: Order): void {
    order.place();
  }
}

@CommandHandler(MarkOrderPaid)
export class MarkOrderPaidHandler extends OrderTransitionHandler<MarkOrderPaid> {
  protected apply(order: Order): void {
    order.markPaid();
  }
}

@CommandHandler(CancelOrder)
export class CancelOrderHandler extends OrderTransitionHandler<CancelOrder> {
  protected apply(order: Order, { reason }: CancelOrder): void {
    order.cancel(reason);
  }
}
