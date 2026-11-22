import type { IEvent } from '@nestjs/cqrs';

export class UnknownEventError extends Error {
  constructor(name: string) {
    super(`Unknown event type: ${name}`);
    this.name = 'UnknownEventError';
  }
}

export class InvalidEventPayloadError extends Error {
  constructor(eventName: string, detail: string) {
    super(`Invalid payload for ${eventName}: ${detail}`);
    this.name = 'InvalidEventPayloadError';
  }
}

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: number;
}

/**
 * Base of every event on the bus. Subclasses declare their payload keys in the
 * static `fields` list; the constructor rejects payloads missing any of them.
 * `occurredAt` is an ISO string, set at construction unless the payload has one
 * (so `eventFromJson(name, JSON.parse(JSON.stringify(event)))` round-trips).
 */
export abstract class DomainEvent implements IEvent {
  static readonly fields: readonly string[] = [];
  readonly occurredAt: string;

  constructor(payload: object) {
    const ctor = this.constructor as typeof DomainEvent;
    if (payload === null || typeof payload !== 'object') {
      throw new InvalidEventPayloadError(
        ctor.name,
        'payload must be an object',
      );
    }
    const data = payload as Record<string, unknown>;
    for (const field of ctor.fields) {
      if (data[field] === undefined || data[field] === null) {
        throw new InvalidEventPayloadError(
          ctor.name,
          `missing required field "${field}"`,
        );
      }
    }
    for (const field of ctor.fields) {
      (this as Record<string, unknown>)[field] = data[field];
    }
    this.occurredAt =
      typeof data.occurredAt === 'string'
        ? data.occurredAt
        : new Date().toISOString();
  }
}

export abstract class OrderEvent extends DomainEvent {
  abstract readonly orderId: string;
}
