import { logs, trace } from '@opentelemetry/api';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import {
  rateLimitedDiagLogger,
  startTelemetry,
  telemetryConfig,
} from './telemetry';

describe('telemetryConfig', () => {
  it('no endpoint → exporters none', () =>
    expect(telemetryConfig({})).toMatchObject({
      tracesExporter: 'none',
      logsExporter: 'none',
    }));

  it('endpoint → otlp', () =>
    expect(
      telemetryConfig({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318' }),
    ).toMatchObject({ tracesExporter: 'otlp', logsExporter: 'otlp' }));

  it('explicit console wins', () =>
    expect(
      telemetryConfig({ OTEL_TRACES_EXPORTER: 'console' }).tracesExporter,
    ).toBe('console'));

  it('explicit none wins over an endpoint', () =>
    expect(
      telemetryConfig({
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://x:4318',
        OTEL_LOGS_EXPORTER: 'none',
      }),
    ).toMatchObject({ tracesExporter: 'otlp', logsExporter: 'none' }));

  it('resource is explicit only', () => {
    const r = telemetryConfig({
      APP_VERSION: 'abc1234',
      OTEL_RESOURCE_ATTRIBUTES:
        'deployment.environment.name=lab,k8s.pod.name=p',
    }).resourceAttributes;
    expect(r).toEqual({
      'service.name': 'pv293-eshop',
      'service.version': 'abc1234',
      'deployment.environment.name': 'lab',
      'k8s.pod.name': 'p',
    });
  });

  it('defaults', () =>
    expect(telemetryConfig({}).resourceAttributes).toEqual({
      'service.name': 'pv293-eshop',
      'service.version': 'dev',
      'deployment.environment.name': 'local',
    }));
});

describe('rateLimitedDiagLogger', () => {
  it('writes at most one line per minute', () => {
    const lines: string[] = [];
    let now = 0;
    const logger = rateLimitedDiagLogger(
      (line) => lines.push(line),
      () => now,
    );
    logger.error('export failed');
    logger.warn('export failed again');
    now = 59_999;
    logger.error('still failing');
    expect(lines).toHaveLength(1);
    now = 60_000;
    logger.error('failing after a minute');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('failing after a minute');
    expect(lines[1]).toContain('2 suppressed');
  });
});

describe('startTelemetry', () => {
  const spanExporter = new InMemorySpanExporter();
  const logExporter = new InMemoryLogRecordExporter();
  const telemetry = startTelemetry({ spanExporter, logExporter, env: {} });

  afterAll(() => telemetry.shutdown());

  it('returns the first instance on a second call', () =>
    expect(startTelemetry()).toBe(telemetry));

  it('carries the explicit resource only', () =>
    expect(telemetry.resource.attributes).toEqual({
      'service.name': 'pv293-eshop',
      'service.version': 'dev',
      'deployment.environment.name': 'local',
    }));

  it('exports spans and log records to the injected exporters', () => {
    trace.getTracer('test').startActiveSpan('unit', (span) => {
      logs.getLogger('test').emit({ body: 'inside' });
      span.end();
    });
    const [span] = spanExporter.getFinishedSpans();
    expect(span.name).toBe('unit');
    const [record] = logExporter.getFinishedLogRecords();
    expect(record.body).toBe('inside');
    expect(record.spanContext?.traceId).toBe(span.spanContext().traceId);
  });
});
