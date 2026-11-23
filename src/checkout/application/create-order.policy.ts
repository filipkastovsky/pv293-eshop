import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { CartCheckedOut } from '../../contracts';
import { ChaosService } from '../../platform';
import { Order } from '../domain/order';

@Injectable()
export class CreateOrderPolicy {
  constructor(private readonly chaos: ChaosService) {}

  handle(event: CartCheckedOut): Order {
    this.chaos.maybeFail('CreateOrderPolicy');
    return Order.create(randomUUID(), event.cartId, event.customerEmail, event.lines);
  }
}
