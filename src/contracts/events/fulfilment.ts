import { OrderEvent } from '../domain-event';

export class OrderPacked extends OrderEvent {
  static readonly fields = ['orderId', 'shipmentId'] as const;
  declare readonly orderId: string;
  declare readonly shipmentId: string;
}
