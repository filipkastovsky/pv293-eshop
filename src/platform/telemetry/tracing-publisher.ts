import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus, IEvent, IEventPublisher } from '@nestjs/cqrs';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';

const TRACER = 'pv293-eshop/event-bus';

/**
 * Wraps the bus's publisher: every `EventBus.publish` runs inside a `publish <Event>` PRODUCER
 * span. The in-process bus dispatches synchronously, so handler spans become its children.
 */
export class TracingPublisher implements IEventPublisher {
  constructor(readonly inner: IEventPublisher) {}

  publish<T extends IEvent>(event: T, ...rest: unknown[]): unknown {
    const name = event?.constructor?.name ?? 'unknown';
    const orderId = (event as { orderId?: unknown }).orderId;
    return trace.getTracer(TRACER).startActiveSpan(
      `publish ${name}`,
      {
        kind: SpanKind.PRODUCER,
        attributes: {
          'messaging.system': 'nestjs-cqrs',
          'messaging.operation.type': 'send',
          'messaging.destination.name': name,
          ...(typeof orderId === 'string' ? { 'app.order_id': orderId } : {}),
        },
      },
      (span) => {
        try {
          return (this.inner.publish as (...a: unknown[]) => unknown).call(
            this.inner,
            event,
            ...rest,
          );
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }
}

/** Installs the tracing publisher on the EventBus once, before anything publishes. */
@Injectable()
export class TracingPublisherInstaller implements OnModuleInit {
  constructor(private readonly eventBus: EventBus) {}

  onModuleInit(): void {
    if (this.eventBus.publisher instanceof TracingPublisher) return;
    this.eventBus.publisher = new TracingPublisher(this.eventBus.publisher);
  }
}
