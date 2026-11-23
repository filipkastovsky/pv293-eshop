import { Injectable, OnApplicationBootstrap, Type } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Attributes, SpanKind, trace } from '@opentelemetry/api';
import { Span } from 'nestjs-otel';
import {
  HandlerContext,
  recordFailure,
  runInHandlerContext,
} from './handler-context';

// @nestjs/cqrs does not export its metadata keys.
const EVENTS_HANDLER_METADATA = '__eventsHandler__';
const COMMAND_HANDLER_METADATA = '__commandHandler__';
const QUERY_HANDLER_METADATA = '__queryHandler__';

/** On a method this file installed: the unwrapped original, so nothing is wrapped twice. */
const ORIGINAL = Symbol('pv293.telemetry.original');

const APP_MODULES = [
  'catalog',
  'checkout',
  'inventory',
  'fulfilment',
  'payment',
  'notifications',
] as const;

/**
 * `app.module` from the Nest module class name: `CheckoutModule` → `checkout`. A module whose
 * name does not start with a business module's name (PlatformModule, its submodules, CqrsModule,
 * a test's root module) counts as `platform`.
 */
export function appModuleOf(moduleClassName: string): string {
  const name = moduleClassName.replace(/Module$/, '').toLowerCase();
  return APP_MODULES.find((m) => name.startsWith(m)) ?? 'platform';
}

type HandlerKind = 'event' | 'command' | 'query';

interface HandlerHandle {
  (...args: unknown[]): unknown;
  [ORIGINAL]?: HandlerHandle;
}

/**
 * Gives every CQRS handler a span and a handler context without touching handler code.
 * At bootstrap it finds providers with event, command or query handler metadata and wraps the
 * method the bus calls (`handle` for event handlers, `execute` for command and query handlers)
 * on the prototype, twice:
 *  - inside: sets the HandlerContext (AsyncLocalStorage) and records in the failure registry
 *    which handler let a thrown value escape, then rethrows the same value;
 *  - outside: nestjs-otel's `Span`, which starts the span, marks it ERROR on a throw or
 *    rejection, and ends it.
 * The buses call `instance.handle(event)` / `instance.execute(command)` at dispatch time, so
 * wrapping the prototype is enough.
 */
@Injectable()
export class HandlerTracing implements OnApplicationBootstrap {
  constructor(private readonly modules: ModulesContainer) {}

  onApplicationBootstrap(): void {
    for (const moduleRef of this.modules.values()) {
      const module = appModuleOf(moduleRef.metatype?.name ?? '');
      for (const wrapper of moduleRef.providers.values()) {
        const type = (wrapper.instance?.constructor ?? wrapper.metatype) as
          | Type
          | undefined;
        if (typeof type === 'function') wrapHandler(type, module);
      }
    }
  }
}

function handlerKind(type: Type): HandlerKind | undefined {
  if (Reflect.hasMetadata(EVENTS_HANDLER_METADATA, type)) return 'event';
  if (Reflect.hasMetadata(COMMAND_HANDLER_METADATA, type)) return 'command';
  if (Reflect.hasMetadata(QUERY_HANDLER_METADATA, type)) return 'query';
  return undefined;
}

const messageName = (message: unknown): string =>
  (message as object | null | undefined)?.constructor?.name ?? 'unknown';

const orderIdOf = (message: unknown): string | undefined => {
  const orderId = (message as { orderId?: unknown } | null | undefined)
    ?.orderId;
  return typeof orderId === 'string' ? orderId : undefined;
};

export function wrapHandler(type: Type, module: string): void {
  const kind = handlerKind(type);
  const proto = type.prototype as Record<string, unknown> | undefined;
  if (!kind || !proto) return;
  const method = kind === 'event' ? 'handle' : 'execute';
  const current = proto[method] as HandlerHandle | undefined;
  if (typeof current !== 'function') return;
  // Already wrapped for this class (a second app boot in the same process).
  if (Object.hasOwn(proto, method) && current[ORIGINAL]) return;

  const handler = type.name;
  // A subclass handler inheriting a wrapped method gets its own span, not a nested pair.
  const original = current[ORIGINAL] ?? current;
  const firstEvent: string | undefined =
    kind === 'event'
      ? (Reflect.getMetadata(EVENTS_HANDLER_METADATA, type) as Type[])[0]?.name
      : undefined;

  const inner: HandlerHandle = function (this: unknown, ...args: unknown[]) {
    const message = args[0];
    const event = kind === 'event' ? messageName(message) : undefined;
    // `Span` takes one fixed name; a handler of several events renames per call.
    if (event && event !== firstEvent) {
      trace.getActiveSpan()?.updateName(`process ${event}`);
    }
    const orderId = orderIdOf(message);
    const ctx: HandlerContext = {
      module,
      handler,
      ...(event ? { event } : {}),
      ...(orderId ? { orderId } : {}),
    };
    return runInHandlerContext(ctx, () => {
      try {
        const result = original.apply(this, args);
        if (result instanceof Promise) {
          return result.catch((error: unknown) => {
            recordFailure(error, handler);
            throw error;
          });
        }
        return result;
      } catch (error) {
        recordFailure(error, handler);
        throw error;
      }
    });
  };
  inner[ORIGINAL] = original;

  const spanKind = kind === 'event' ? SpanKind.CONSUMER : SpanKind.INTERNAL;
  const spanName = kind === 'event' ? `process ${firstEvent}` : handler;
  const descriptor: PropertyDescriptor = {
    value: inner,
    writable: true,
    configurable: true,
    enumerable: false,
  };
  Span(spanName, (...args: unknown[]) => ({
    kind: spanKind,
    attributes: spanAttributes(kind, args[0], handler, module),
  }))(proto, method, descriptor);
  Object.defineProperty(proto, method, descriptor);
}

function spanAttributes(
  kind: HandlerKind,
  message: unknown,
  handler: string,
  module: string,
): Attributes {
  const orderId = orderIdOf(message);
  return {
    ...(kind === 'event'
      ? {
          'messaging.system': 'nestjs-cqrs',
          'messaging.operation.type': 'process',
          'messaging.destination.name': messageName(message),
        }
      : {}),
    'app.handler': handler,
    'app.module': module,
    ...(orderId ? { 'app.order_id': orderId } : {}),
  };
}
