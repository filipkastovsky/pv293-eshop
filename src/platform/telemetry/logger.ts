import { LoggerService } from '@nestjs/common';
import {
  AnyValue,
  Attributes,
  logs,
  SeverityNumber,
  trace,
} from '@opentelemetry/api';
import { DestinationStream, Level, Logger as Pino, pino } from 'pino';
import { currentHandlerContext } from './handler-context';
import { Fields, isRecord, redact, scrubbedMessage, scrubText } from './redact';

export interface PlatformLoggerOptions {
  /** Where the JSON lines go. Defaults to stdout. */
  destination?: DestinationStream;
  /** Minimum level (pino names). Defaults to env `LOG_LEVEL`, else `info`. */
  level?: string;
}

const LEVELS: readonly string[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
];

const SEVERITY: Record<Level, SeverityNumber> = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

/** Framework boot chatter: one line per module and route. Kept at debug so `info` is quiet. */
const BOOT_CONTEXTS = new Set([
  'RoutesResolver',
  'RouterExplorer',
  'InstanceLoader',
  'NestFactory',
]);

const OTEL_LOGGER_NAME = 'pv293-eshop';

/**
 * The app's Nest logger (`app.useLogger`). Every `new Logger(Foo.name)` call ends here and
 * becomes one record, written twice: as a pino JSON line on stdout (for `kubectl logs`) and
 * through the OpenTelemetry Logs API (exported over OTLP when configured). Both outputs get
 * the same fields, redacted once. The OTel record takes its trace context from the active
 * span; stdout gets `trace_id`, `span_id` and `trace_flags` only when a span is active.
 */
export class PlatformLogger implements LoggerService {
  private readonly pino: Pino;

  constructor(options: PlatformLoggerOptions = {}) {
    const level = levelFrom(options.level ?? process.env.LOG_LEVEL);
    this.pino = pino(
      {
        level,
        base: undefined,
        messageKey: 'msg',
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: { level: (label) => ({ level: label }) },
        mixin: traceFields,
      },
      options.destination ?? pino.destination({ dest: 1, sync: true }),
    );
  }

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  private write(requested: Level, message: unknown, params: unknown[]): void {
    const { context, rest } = splitContext(params);
    const level =
      requested === 'info' && context && BOOT_CONTEXTS.has(context)
        ? 'debug'
        : requested;
    if (!this.pino.isLevelEnabled(level)) return;

    const record = toRecord(message, rest, level);
    const fields = scrubErrorText(
      redact({
        ...(context ? { logger: context } : {}),
        ...handlerFields(),
        ...record.fields,
      }),
    );
    const msg = scrubText(record.msg);

    this.pino[level](fields, msg);
    logs.getLogger(OTEL_LOGGER_NAME).emit({
      severityNumber: SEVERITY[level],
      severityText: level,
      body: msg,
      attributes: toAttributes(fields),
    });
  }
}

function levelFrom(raw: string | undefined): string {
  const level = raw?.trim().toLowerCase();
  return level && LEVELS.includes(level) ? level : 'info';
}

/** Only while a span is active; the OTel record carries the same context natively. */
function traceFields(): Fields {
  const ctx = trace.getActiveSpan()?.spanContext();
  if (!ctx) return {};
  return {
    trace_id: ctx.traceId,
    span_id: ctx.spanId,
    trace_flags: ctx.traceFlags.toString(16).padStart(2, '0'),
  };
}

function handlerFields(): Fields {
  const handler = currentHandlerContext();
  if (!handler) return {};
  return {
    'app.module': handler.module,
    'app.handler': handler.handler,
    ...(handler.event ? { 'app.event': handler.event } : {}),
    ...(handler.orderId ? { 'app.order_id': handler.orderId } : {}),
  };
}

const STACK_LINE = /\n\s+at /;
const isStack = (value: unknown): value is string =>
  typeof value === 'string' && STACK_LINE.test(value);

/**
 * Nest's `Logger` appends its context as the last string argument. A stack trace (Nest's
 * `error(message, stack, context)` form, or a static call without context) is not a context.
 */
function splitContext(params: unknown[]): {
  context?: string;
  rest: unknown[];
} {
  const last = params.at(-1);
  if (typeof last === 'string' && !isStack(last)) {
    return { context: last, rest: params.slice(0, -1) };
  }
  return { rest: params };
}

/**
 * Turns Nest's loose arguments into a message and fields: objects (plain or class instances,
 * own enumerable properties) become fields, an
 * Error or a stack becomes `err.*`, and anything else thrown at `error` (a string, say) is
 * reported as the error too.
 */
function toRecord(
  message: unknown,
  params: unknown[],
  level: Level,
): { msg: string; fields: Fields } {
  let fields: Fields = {};
  const extra: string[] = [];
  let msg: string;

  if (message instanceof Error) {
    msg = scrubbedMessage(message);
    fields = errorFields(message);
  } else if (isRecord(message)) {
    const { msg: m, message: mm, ...rest } = { ...message };
    msg = String(m ?? mm ?? '');
    fields = { ...rest };
  } else {
    msg = String(message);
  }

  for (const param of params) {
    if (param === undefined) continue;
    if (isRecord(param)) {
      fields = { ...fields, ...param };
    } else if (param instanceof Error) {
      fields = { ...fields, ...errorFields(param) };
    } else if (isStack(param)) {
      fields = { ...fields, ...stackFields(param, fields) };
    } else if (
      (level === 'error' || level === 'fatal') &&
      !('err.type' in fields)
    ) {
      fields = {
        ...fields,
        'err.type': typeof param,
        'err.message': String(param),
      };
    } else {
      extra.push(String(param));
    }
  }

  if (extra.length > 0) msg = [msg, ...extra].join(' ');
  return { msg, fields };
}

function errorFields(error: Error): Fields {
  return {
    'err.type': error.constructor?.name || error.name,
    'err.message': scrubbedMessage(error),
    ...(error.stack ? { 'err.stack': error.stack } : {}),
  };
}

/**
 * The error text fields (`err.message`, `err.stack`) may carry values, e.g. a failed query's
 * bound parameters; key-based redaction cannot see those.
 */
function scrubErrorText(fields: Fields): Fields {
  for (const key of ['err.message', 'err.stack']) {
    const value = fields[key];
    if (typeof value === 'string') fields[key] = scrubText(value);
  }
  return fields;
}

/** A bare stack string: its first line is `Type: message`. */
function stackFields(stack: string, known: Fields): Fields {
  const head = stack.slice(0, stack.indexOf('\n'));
  const match = /^([\w$.]+): (.*)$/.exec(head);
  return {
    'err.type': known['err.type'] ?? match?.[1] ?? 'Error',
    'err.message': known['err.message'] ?? match?.[2] ?? head,
    'err.stack': stack,
  };
}

/** OTel attribute values must be plain data; anything else goes through JSON. */
function toAttributes(fields: Fields): Attributes {
  const attributes: Record<string, AnyValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    attributes[key] = toAnyValue(value);
  }
  return attributes as Attributes;
}

function toAnyValue(value: unknown): AnyValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as AnyValue;
  } catch {
    return String(value);
  }
}
