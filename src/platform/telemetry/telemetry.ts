import { format } from 'node:util';
import { DiagLogger, DiagLogLevel, diag } from '@opentelemetry/api';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { Resource, resourceFromAttributes } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LogRecordExporter,
  LogRecordProcessor,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  BatchSpanProcessor,
  ConsoleSpanExporter,
  NoopSpanProcessor,
  SimpleSpanProcessor,
  SpanExporter,
  SpanProcessor,
} from '@opentelemetry/sdk-trace';

export type ExporterKind = 'otlp' | 'console' | 'none';

export interface TelemetryOptions {
  /** Replaces the configured span exporter (tests: `InMemorySpanExporter`). */
  spanExporter?: SpanExporter;
  /** Replaces the configured log exporter (tests: `InMemoryLogRecordExporter`). */
  logExporter?: LogRecordExporter;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

export interface Telemetry {
  shutdown(): Promise<void>;
  resource: Resource;
}

const SERVICE_NAME = 'pv293-eshop';
const SHUTDOWN_TIMEOUT_MS = 5_000;
const DIAG_INTERVAL_MS = 60_000;
const EXPORTER_KINDS: readonly ExporterKind[] = ['otlp', 'console', 'none'];

/**
 * Decides exporters and resource from the environment. Pure: it reads only `env`.
 * Exporters are on only when an OTLP endpoint is set or an exporter is named explicitly.
 */
export function telemetryConfig(env: NodeJS.ProcessEnv): {
  tracesExporter: ExporterKind;
  logsExporter: ExporterKind;
  resourceAttributes: Record<string, string>;
} {
  return {
    tracesExporter: exporterFor(
      env.OTEL_TRACES_EXPORTER,
      env.OTEL_EXPORTER_OTLP_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
    ),
    logsExporter: exporterFor(
      env.OTEL_LOGS_EXPORTER,
      env.OTEL_EXPORTER_OTLP_ENDPOINT ?? env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT,
    ),
    resourceAttributes: {
      'service.version': 'dev',
      'deployment.environment.name': 'local',
      ...parseResourceAttributes(env.OTEL_RESOURCE_ATTRIBUTES),
      ...(env.APP_VERSION ? { 'service.version': env.APP_VERSION } : {}),
      'service.name': env.OTEL_SERVICE_NAME || SERVICE_NAME,
    },
  };
}

function exporterFor(
  explicit: string | undefined,
  endpoint: string | undefined,
): ExporterKind {
  const named = explicit?.trim().toLowerCase();
  if (named && (EXPORTER_KINDS as readonly string[]).includes(named)) {
    return named as ExporterKind;
  }
  return endpoint ? 'otlp' : 'none';
}

/** `OTEL_RESOURCE_ATTRIBUTES`: `key=value` pairs, comma-separated, values percent-encoded. */
function parseResourceAttributes(
  raw: string | undefined,
): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const pair of raw?.split(',') ?? []) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    try {
      attributes[key] = decodeURIComponent(value);
    } catch {
      attributes[key] = value;
    }
  }
  return attributes;
}

/**
 * The SDK reports its own failures (an unreachable collector, for instance) through the diag
 * logger. This one writes at most one line per interval and counts the lines it swallowed.
 */
export function rateLimitedDiagLogger(
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  now: () => number = Date.now,
  intervalMs = DIAG_INTERVAL_MS,
): DiagLogger {
  let lastWrite: number | undefined;
  let suppressed = 0;
  const log =
    (level: string) =>
    (message: string, ...args: unknown[]) => {
      const t = now();
      if (lastWrite !== undefined && t - lastWrite < intervalMs) {
        suppressed++;
        return;
      }
      const note = suppressed > 0 ? ` (${suppressed} suppressed)` : '';
      lastWrite = t;
      suppressed = 0;
      write(`[otel] ${level}: ${format(message, ...args)}${note}`);
    };
  return {
    error: log('error'),
    warn: log('warn'),
    info: log('info'),
    debug: log('debug'),
    verbose: log('verbose'),
  };
}

let instance: Telemetry | undefined;

/**
 * Starts the OpenTelemetry SDK once per process and returns the running instance on later calls.
 * Global tracer and logger providers are always registered, so spans and trace ids exist even
 * when nothing is exported.
 */
export function startTelemetry(opts: TelemetryOptions = {}): Telemetry {
  if (instance) return instance;

  const config = telemetryConfig(opts.env ?? process.env);
  diag.setLogger(rateLimitedDiagLogger(), {
    logLevel: DiagLogLevel.WARN,
    suppressOverrideMessage: true,
  });

  const resource = resourceFromAttributes(config.resourceAttributes);
  const sdk = new NodeSDK({
    autoDetectResources: false,
    resource,
    instrumentations: [
      new HttpInstrumentation(),
      new ExpressInstrumentation(),
      new PgInstrumentation({ requireParentSpan: true }),
    ],
    spanProcessors: [spanProcessor(config.tracesExporter, opts.spanExporter)],
    logRecordProcessors: logRecordProcessors(
      config.logsExporter,
      opts.logExporter,
    ),
    metricReaders: [],
  });
  sdk.start();

  let stopped: Promise<void> | undefined;
  const shutdown = () => {
    stopped ??= withTimeout(sdk.shutdown(), SHUTDOWN_TIMEOUT_MS);
    return stopped;
  };
  process.on('SIGTERM', () => onSigterm(shutdown));

  instance = { shutdown, resource };
  return instance;
}

function spanProcessor(
  kind: ExporterKind,
  injected: SpanExporter | undefined,
): SpanProcessor {
  if (injected) return new SimpleSpanProcessor({ exporter: injected });
  if (kind === 'otlp')
    return new BatchSpanProcessor({ exporter: new OTLPTraceExporter() });
  if (kind === 'console')
    return new BatchSpanProcessor({ exporter: new ConsoleSpanExporter() });
  // NodeSDK registers a tracer provider only when it has a processor.
  return new NoopSpanProcessor();
}

function logRecordProcessors(
  kind: ExporterKind,
  injected: LogRecordExporter | undefined,
): LogRecordProcessor[] {
  if (injected) return [new SimpleLogRecordProcessor({ exporter: injected })];
  if (kind === 'otlp')
    return [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })];
  if (kind === 'console')
    return [
      new BatchLogRecordProcessor({ exporter: new ConsoleLogRecordExporter() }),
    ];
  return [];
}

/**
 * Nest's shutdown hooks also listen for SIGTERM: they close the app, remove their listener and
 * raise SIGTERM again. While another listener is still registered we leave the signal to it; on
 * the re-raised signal (or when nobody else listens) we flush telemetry and exit 0.
 */
function onSigterm(shutdown: () => Promise<void>): void {
  if (process.listenerCount('SIGTERM') > 1) return;
  void shutdown().finally(() => process.exit(0));
}

function withTimeout(work: Promise<void>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      diag.warn(`telemetry shutdown timed out after ${ms} ms`);
      resolve();
    }, ms);
  });
  return Promise.race([work.catch(() => undefined), timeout]).finally(() =>
    clearTimeout(timer),
  );
}
