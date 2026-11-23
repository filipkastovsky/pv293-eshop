import { Context } from '@opentelemetry/api';
import { ReadableSpan, Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import { scrubText } from './redact';

/**
 * Scrubs error text on a span just before it ends, so every exporter sees the clean version:
 * the status message and the `exception.message` / `exception.stacktrace` of exception events.
 * A failed query's message carries its bound parameters (customer data); this is where that
 * text stops, however the exception was recorded.
 */
export class ScrubbingSpanProcessor implements SpanProcessor {
  onStart(_span: Span, _parentContext: Context): void {}

  onEnding(span: Span): void {
    const status = span.status as { message?: string };
    if (status.message) status.message = scrubText(status.message);
    for (const event of span.events) {
      const attributes = event.attributes as
        | Record<string, unknown>
        | undefined;
      if (!attributes) continue;
      for (const key of ['exception.message', 'exception.stacktrace']) {
        const value = attributes[key];
        if (typeof value === 'string') attributes[key] = scrubText(value);
      }
    }
  }

  onEnd(_span: ReadableSpan): void {}

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }
}
