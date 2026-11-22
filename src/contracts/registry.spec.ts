import {
  EVENT_TYPES,
  eventFromJson,
  InvalidEventPayloadError,
  OrderPaid,
  UnknownEventError,
} from './index';

const EXPECTED = [
  'ProductAdded',
  'PriceChanged',
  'ProductDiscontinued',
  'ItemAddedToCart',
  'ItemRemovedFromCart',
  'CartCheckedOut',
  'OrderCreated',
  'OrderPlaced',
  'OrderPaid',
  'OrderCancelled',
  'StockReceived',
  'StockReserved',
  'StockReservationFailed',
  'StockReleased',
  'OrderPacked',
  'PaymentInitiated',
  'PaymentSucceeded',
  'PaymentFailed',
  'OrderSummarySent',
  'CancellationNoticeSent',
];

describe('contracts registry', () => {
  it('registry lists every exported event class', () => {
    expect(Object.keys(EVENT_TYPES).sort()).toEqual([...EXPECTED].sort());
  });

  it('eventFromJson builds the event', () => {
    const e = eventFromJson('OrderPaid', { orderId: 'o1' });
    expect(e).toBeInstanceOf(OrderPaid);
    expect((e as OrderPaid).orderId).toBe('o1');
    expect(typeof e.occurredAt).toBe('string');
    const again = eventFromJson('OrderPaid', JSON.parse(JSON.stringify(e)));
    expect(again.occurredAt).toBe(e.occurredAt);
  });

  it('unknown name throws UnknownEventError', () => {
    expect(() => eventFromJson('Nope', {})).toThrow(UnknownEventError);
  });

  it('OrderEvent without orderId throws InvalidEventPayloadError', () => {
    expect(() => eventFromJson('OrderPaid', {})).toThrow(
      InvalidEventPayloadError,
    );
    expect(() => eventFromJson('OrderPaid', null)).toThrow(
      InvalidEventPayloadError,
    );
  });

  it('every class requires all its declared fields', () => {
    for (const [name, cls] of Object.entries(EVENT_TYPES)) {
      const fields = (cls as unknown as { fields: string[] }).fields;
      expect(fields.length).toBeGreaterThan(0);
      const full = Object.fromEntries(fields.map((f) => [f, 'x']));
      expect(() => eventFromJson(name, full)).not.toThrow();
      for (const f of fields) {
        const { [f]: _omit, ...rest } = full;
        expect(() => eventFromJson(name, rest)).toThrow(
          InvalidEventPayloadError,
        );
      }
    }
  });
});
