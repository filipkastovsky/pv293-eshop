import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { startTelemetry } from '../../src/platform/telemetry/telemetry';

/** Every span and log record the app produced since the last `resetTelemetry()`. */
export const spans = new InMemorySpanExporter();
export const logs = new InMemoryLogRecordExporter();

// Jest gives each test file its own module registry and globals, so this runs once per file,
// before `bootTestApp` requires AppModule. `startTelemetry` itself ignores a second call.
startTelemetry({ spanExporter: spans, logExporter: logs });

export function resetTelemetry(): void {
  spans.reset();
  logs.reset();
}
