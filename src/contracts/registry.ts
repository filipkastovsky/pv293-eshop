import {
  DomainEvent,
  InvalidEventPayloadError,
  UnknownEventError,
} from './domain-event';
import * as catalog from './events/catalog';
import * as checkout from './events/checkout';
import * as fulfilment from './events/fulfilment';
import * as inventory from './events/inventory';
import * as notifications from './events/notifications';
import * as payment from './events/payment';

export const EVENT_TYPES: Record<string, new (payload: object) => DomainEvent> =
  {
    ...catalog,
    ...checkout,
    ...inventory,
    ...fulfilment,
    ...payment,
    ...notifications,
  };

export function eventFromJson(name: string, payload: unknown): DomainEvent {
  if (!Object.hasOwn(EVENT_TYPES, name)) throw new UnknownEventError(name);
  if (payload === null || typeof payload !== 'object') {
    throw new InvalidEventPayloadError(name, 'payload must be an object');
  }
  return new EVENT_TYPES[name](payload);
}
