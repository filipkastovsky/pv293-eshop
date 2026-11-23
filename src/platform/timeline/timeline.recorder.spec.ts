import { context } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import { OrderPlaced } from '../../contracts';
import { startTelemetry } from '../telemetry/telemetry';
import { TimelineRecorder } from './timeline.recorder';

jest.mock('../db/migrate-module', () => ({
  migrateModule: () => Promise.resolve(),
}));

// Registers the context manager, so `context.with` really scopes.
beforeAll(() => startTelemetry());

describe('TimelineRecorder', () => {
  it('writes timeline rows with tracing suppressed, so no pg span lands under a publish span', async () => {
    const suppressed: boolean[] = [];
    const db = {
      insert: () => ({
        // Lazy like Drizzle's builder: the query runs when it is awaited (`then`).
        values: () => ({
          // biome-ignore lint/suspicious/noThenProperty: mimics Drizzle's thenable query builder
          then: (resolve: () => void) => {
            suppressed.push(isTracingSuppressed(context.active()));
            resolve();
          },
        }),
      }),
    };
    let onEvent: (event: unknown) => void = () => undefined;
    const eventBus = { subscribe: (fn: typeof onEvent) => (onEvent = fn) };
    const exceptions = { subscribe: () => undefined };
    const recorder = new TimelineRecorder(
      db as never,
      eventBus as never,
      exceptions as never,
    );
    await recorder.onModuleInit();

    onEvent(
      new OrderPlaced({
        orderId: 'o-1',
        customerEmail: 'a@b.cz',
        lines: [{ sku: 'X', quantity: 1, unitPrice: 1 }],
        total: 1,
      }),
    );
    await (recorder as unknown as { queue: Promise<void> }).queue;

    expect(suppressed).toEqual([true]);
  });
});
