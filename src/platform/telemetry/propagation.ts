import {
  context,
  isSpanContextValid,
  type Link,
  propagation,
  ROOT_CONTEXT,
  trace,
} from '@opentelemetry/api';

/** W3C trace context as stored next to a message, e.g. in a JSON column. */
export type TraceCarrier = { traceparent?: string; tracestate?: string };

/** The active span's context as a carrier, or null when no span is active. */
export function captureContext(): TraceCarrier | null {
  if (!trace.getSpan(context.active())) return null;
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return carrier.traceparent ? carrier : null;
}

/**
 * A span link to the context stored in `carrier`, or no links when it is null, malformed or not
 * a valid W3C trace context. Never throws: a bad row must not stop the relay.
 */
export function linkFrom(carrier: unknown): Link[] {
  try {
    if (typeof carrier !== 'object' || carrier === null) return [];
    const { traceparent, tracestate } = carrier as Record<string, unknown>;
    if (typeof traceparent !== 'string') return [];
    const extracted = propagation.extract(ROOT_CONTEXT, {
      traceparent,
      ...(typeof tracestate === 'string' ? { tracestate } : {}),
    });
    const spanContext = trace.getSpanContext(extracted);
    return spanContext && isSpanContextValid(spanContext)
      ? [{ context: spanContext }]
      : [];
  } catch {
    return [];
  }
}
