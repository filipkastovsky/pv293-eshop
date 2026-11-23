import { INestApplication, Module } from '@nestjs/common';
import {
  CommandBus,
  CommandHandler,
  CqrsModule,
  EventsHandler,
  ICommandHandler,
  IEventHandler,
  IQueryHandler,
  QueryBus,
  QueryHandler,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import {
  currentHandlerContext,
  failedHandler,
  recordFailure,
} from './handler-context';
import { appModuleOf, HandlerTracing, wrapHandler } from './handler-tracing';
import { startTelemetry } from './telemetry';

const spans = new InMemorySpanExporter();
startTelemetry({ spanExporter: spans, env: {} });

class Paid {
  constructor(readonly orderId: string) {}
}
class Cancelled {
  constructor(readonly orderId: string) {}
}
class Ship {
  constructor(readonly orderId: string) {}
}
class GetShipment {
  constructor(readonly orderId: string) {}
}

describe('appModuleOf', () => {
  it.each([
    ['CheckoutModule', 'checkout'],
    ['NotificationsModule', 'notifications'],
    ['FulfilmentModule', 'fulfilment'],
    ['PlatformModule', 'platform'],
    ['TimelineModule', 'platform'],
    ['CqrsModule', 'platform'],
    ['RootTestModule', 'platform'],
    ['', 'platform'],
  ])('%s → %s', (name, expected) => {
    expect(appModuleOf(name)).toBe(expected);
  });
});

describe('failure registry', () => {
  it('names the handler for an object without touching it', () => {
    const error = new Error('e');
    recordFailure(error, 'A');
    expect(failedHandler(error)).toBe('A');
    expect(Object.keys(error)).toEqual([]);
    expect(failedHandler(new Error('e'))).toBeUndefined();
  });

  it('keeps primitives, at most the last 100', () => {
    for (let i = 0; i < 101; i++) recordFailure(`p${i}`, `H${i}`);
    expect(failedHandler('p0')).toBeUndefined();
    expect(failedHandler('p1')).toBe('H1');
    expect(failedHandler('p100')).toBe('H100');
    recordFailure(undefined, 'U');
    expect(failedHandler(undefined)).toBe('U');
  });
});

describe('wrapHandler', () => {
  beforeEach(() => spans.reset());

  it('event handler: CONSUMER span per event, context inside, original value rethrown', async () => {
    const seen: unknown[] = [];
    @EventsHandler(Paid, Cancelled)
    class TwoEventsPolicy implements IEventHandler<Paid | Cancelled> {
      async handle(event: Paid | Cancelled) {
        seen.push(currentHandlerContext());
        if (event instanceof Cancelled) throw 'nope';
      }
    }
    wrapHandler(TwoEventsPolicy, 'fulfilment');
    wrapHandler(TwoEventsPolicy, 'fulfilment'); // idempotent

    const policy = new TwoEventsPolicy();
    await policy.handle(new Paid('o1'));
    await expect(policy.handle(new Cancelled('o2'))).rejects.toBe('nope');
    expect(failedHandler('nope')).toBe('TwoEventsPolicy');
    expect(currentHandlerContext()).toBeUndefined();

    expect(seen).toEqual([
      {
        module: 'fulfilment',
        handler: 'TwoEventsPolicy',
        event: 'Paid',
        orderId: 'o1',
      },
      {
        module: 'fulfilment',
        handler: 'TwoEventsPolicy',
        event: 'Cancelled',
        orderId: 'o2',
      },
    ]);
    const [paid, cancelled] = spans.getFinishedSpans();
    expect(spans.getFinishedSpans()).toHaveLength(2);
    expect(paid.name).toBe('process Paid');
    expect(paid.kind).toBe(SpanKind.CONSUMER);
    expect(paid.attributes['messaging.destination.name']).toBe('Paid');
    expect(cancelled.name).toBe('process Cancelled');
    expect(cancelled.attributes['messaging.destination.name']).toBe(
      'Cancelled',
    );
    expect(cancelled.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('a subclass handler inheriting a wrapped handle gets one span with its own name', async () => {
    @EventsHandler(Paid)
    class BasePolicy implements IEventHandler<Paid> {
      handle(): void {}
    }
    @EventsHandler(Paid)
    class SubPolicy extends BasePolicy {}
    wrapHandler(BasePolicy, 'payment');
    wrapHandler(SubPolicy, 'payment');

    new SubPolicy().handle();
    const finished = spans.getFinishedSpans();
    expect(finished).toHaveLength(1);
    expect(finished[0].attributes['app.handler']).toBe('SubPolicy');
  });

  it('ignores classes without handler metadata', () => {
    class Plain {
      handle() {
        return 1;
      }
    }
    const before = Plain.prototype.handle;
    wrapHandler(Plain, 'platform');
    expect(Plain.prototype.handle).toBe(before);
  });
});

describe('command and query handlers through the buses', () => {
  const boom = new Error('boom');
  const seen: unknown[] = [];

  // Real handlers implement only `execute`; that is what CommandBus and QueryBus call.
  @CommandHandler(Ship)
  class ShipHandler implements ICommandHandler<Ship> {
    async execute(command: Ship): Promise<string> {
      seen.push(currentHandlerContext());
      if (command.orderId === 'bad') throw boom;
      return 'shipped';
    }
  }

  @QueryHandler(GetShipment)
  class GetShipmentHandler implements IQueryHandler<GetShipment> {
    execute(query: GetShipment): Promise<string> {
      seen.push(currentHandlerContext());
      if (query.orderId === 'bad') throw 'no shipment';
      return Promise.resolve(`shipment of ${query.orderId}`);
    }
  }

  // The class name is what `app.module` is derived from.
  @Module({ providers: [ShipHandler, GetShipmentHandler] })
  class FulfilmentModule {}

  let app: INestApplication;
  let commands: CommandBus;
  let queries: QueryBus;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule.forRoot(), FulfilmentModule],
      providers: [HandlerTracing],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    commands = app.get(CommandBus);
    queries = app.get(QueryBus);
  });
  afterAll(() => app.close());
  beforeEach(() => {
    spans.reset();
    seen.length = 0;
  });

  it('CommandBus.execute: INTERNAL span named after the class, context inside', async () => {
    await expect(commands.execute(new Ship('o1'))).resolves.toBe('shipped');

    expect(seen).toEqual([
      { module: 'fulfilment', handler: 'ShipHandler', orderId: 'o1' },
    ]);
    const [span] = spans.getFinishedSpans();
    expect(spans.getFinishedSpans()).toHaveLength(1);
    expect(span.name).toBe('ShipHandler');
    expect(span.kind).toBe(SpanKind.INTERNAL);
    expect(span.attributes).toEqual({
      'app.handler': 'ShipHandler',
      'app.module': 'fulfilment',
      'app.order_id': 'o1',
    });
    expect(span.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('CommandBus.execute rejecting: ERROR span, same Error, registry names the handler', async () => {
    await expect(commands.execute(new Ship('bad'))).rejects.toBe(boom);

    expect(failedHandler(boom)).toBe('ShipHandler');
    const [span] = spans.getFinishedSpans();
    expect(span.name).toBe('ShipHandler');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it('QueryBus.execute: INTERNAL span named after the class, context inside', async () => {
    await expect(queries.execute(new GetShipment('o2'))).resolves.toBe(
      'shipment of o2',
    );

    expect(seen).toEqual([
      { module: 'fulfilment', handler: 'GetShipmentHandler', orderId: 'o2' },
    ]);
    const [span] = spans.getFinishedSpans();
    expect(span.name).toBe('GetShipmentHandler');
    expect(span.kind).toBe(SpanKind.INTERNAL);
    expect(span.attributes).toEqual({
      'app.handler': 'GetShipmentHandler',
      'app.module': 'fulfilment',
      'app.order_id': 'o2',
    });
  });

  it('QueryBus.execute throwing a string: ERROR span, registry names the handler', async () => {
    await expect(queries.execute(new GetShipment('bad'))).rejects.toBe(
      'no shipment',
    );

    expect(failedHandler('no shipment')).toBe('GetShipmentHandler');
    const [span] = spans.getFinishedSpans();
    expect(span.name).toBe('GetShipmentHandler');
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });
});
