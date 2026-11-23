import { AsyncLocalStorage } from 'node:async_hooks';

/** What runs right now: set around every CQRS handler call, read by log enrichment. */
export interface HandlerContext {
  module: string;
  handler: string;
  event?: string;
  orderId?: string;
}

const storage = new AsyncLocalStorage<HandlerContext>();

export function currentHandlerContext(): HandlerContext | undefined {
  return storage.getStore();
}

export function runInHandlerContext<T>(ctx: HandlerContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Failure registry: which handler let a thrown value escape. The CQRS bus reports only the
 * value and the event, so the timeline asks here. The value itself is never touched.
 * Objects are weak keys; primitives (`throw 'x'`) cannot be, so the last ones are kept in a
 * small bounded map. The last handler to record a value wins, which is the one the bus called.
 */
const MAX_PRIMITIVES = 100;
const objects = new WeakMap<object, string>();
const primitives = new Map<unknown, string>();

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

export function recordFailure(error: unknown, handler: string): void {
  if (isObject(error)) {
    objects.set(error, handler);
    return;
  }
  primitives.delete(error);
  primitives.set(error, handler);
  if (primitives.size > MAX_PRIMITIVES) {
    const oldest = primitives.keys().next().value;
    primitives.delete(oldest);
  }
}

export function failedHandler(error: unknown): string | undefined {
  return isObject(error) ? objects.get(error) : primitives.get(error);
}
