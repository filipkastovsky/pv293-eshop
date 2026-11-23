import { Writable } from 'node:stream';
import { SeverityNumber, trace } from '@opentelemetry/api';
import { InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { DrizzleQueryError } from 'drizzle-orm';
import { OrderPlaced } from '../../contracts';
import { runInHandlerContext } from './handler-context';
import { PlatformLogger } from './logger';
import { startTelemetry } from './telemetry';

const otelLogs = new InMemoryLogRecordExporter();
startTelemetry({
  spanExporter: new InMemorySpanExporter(),
  logExporter: otelLogs,
  env: {},
});

/** A PlatformLogger whose stdout lines land in `lines` instead. */
function capture(level?: string) {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _encoding, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        lines.push(JSON.parse(line));
      }
      done();
    },
  });
  return { logger: new PlatformLogger({ destination, level }), lines };
}

const records = () => otelLogs.getFinishedLogRecords();

describe('PlatformLogger', () => {
  beforeEach(() => otelLogs.reset());

  it('inside an active span: trace_id/span_id/trace_flags equal the span context; OTel record has same traceId/spanId', () => {
    const { logger, lines } = capture();
    const tracer = trace.getTracer('test');
    const span = tracer.startActiveSpan('work', (span) => {
      logger.log('inside', 'Test');
      span.end();
      return span;
    });

    const ctx = span.spanContext();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'info',
      msg: 'inside',
      logger: 'Test',
      trace_id: ctx.traceId,
      span_id: ctx.spanId,
      trace_flags: '01',
    });
    expect(typeof lines[0].time).toBe('string');
    expect(records()).toHaveLength(1);
    expect(records()[0].spanContext?.traceId).toBe(ctx.traceId);
    expect(records()[0].spanContext?.spanId).toBe(ctx.spanId);
    expect(records()[0].body).toBe('inside');
    expect(records()[0].attributes).not.toHaveProperty('trace_id');
  });

  it('outside a span: no trace_id/span_id/trace_flags keys at all', () => {
    const { logger, lines } = capture();
    logger.log('outside', 'Test');

    expect(lines[0]).toMatchObject({ level: 'info', msg: 'outside' });
    for (const key of ['trace_id', 'span_id', 'trace_flags']) {
      expect(lines[0]).not.toHaveProperty(key);
    }
    expect(records()[0].spanContext).toBeUndefined();
  });

  it('Nest levels map: log→info, warn→warn, error→error, debug→debug, verbose→trace; OTel severityNumber matches', () => {
    const { logger, lines } = capture('trace');
    logger.log('a', 'Test');
    logger.warn('b', 'Test');
    logger.error('c', undefined, 'Test');
    logger.debug('d', 'Test');
    logger.verbose('e', 'Test');

    expect(lines.map((l) => l.level)).toEqual([
      'info',
      'warn',
      'error',
      'debug',
      'trace',
    ]);
    expect(records().map((r) => [r.severityNumber, r.severityText])).toEqual([
      [SeverityNumber.INFO, 'info'],
      [SeverityNumber.WARN, 'warn'],
      [SeverityNumber.ERROR, 'error'],
      [SeverityNumber.DEBUG, 'debug'],
      [SeverityNumber.TRACE, 'trace'],
    ]);
  });

  it('records below the level go nowhere (default info, LOG_LEVEL overrides)', () => {
    const { logger, lines } = capture();
    logger.debug('hidden', 'Test');
    logger.verbose('hidden', 'Test');
    expect(lines).toEqual([]);
    expect(records()).toEqual([]);

    const previous = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';
    try {
      const quiet = capture();
      quiet.logger.log('hidden', 'Test');
      quiet.logger.warn('shown', 'Test');
      expect(quiet.lines.map((l) => l.msg)).toEqual(['shown']);
    } finally {
      if (previous === undefined) delete process.env.LOG_LEVEL;
      else process.env.LOG_LEVEL = previous;
    }
  });

  it('RoutesResolver/RouterExplorer/InstanceLoader/NestFactory contexts log at debug', () => {
    const quiet = capture();
    for (const context of [
      'RoutesResolver',
      'RouterExplorer',
      'InstanceLoader',
      'NestFactory',
    ]) {
      quiet.logger.log('boot noise', context);
    }
    quiet.logger.log(
      'Nest application successfully started',
      'NestApplication',
    );
    expect(quiet.lines.map((l) => l.logger)).toEqual(['NestApplication']);

    const verbose = capture('debug');
    verbose.logger.log('Mapped {/health, GET} route', 'RouterExplorer');
    expect(verbose.lines[0]).toMatchObject({
      level: 'debug',
      logger: 'RouterExplorer',
    });
  });

  it('error(message, stack) → one record with err.type, err.message, err.stack', () => {
    const { logger, lines } = capture();
    const error = new TypeError('bad input');
    logger.error('request failed', error.stack, 'Test');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'error',
      msg: 'request failed',
      logger: 'Test',
      'err.stack': error.stack,
    });
    expect(lines[0]['err.message']).toBe('bad input');
    expect(lines[0]['err.type']).toBe('TypeError');
    expect(records()).toHaveLength(1);
    expect(records()[0].attributes).toMatchObject({
      'err.stack': error.stack,
      'err.message': 'bad input',
      'err.type': 'TypeError',
    });
  });

  it('error objects: Nest CQRS style (msg, error, context), filter style (error), thrown strings', () => {
    const { logger, lines } = capture();
    const error = new RangeError('out of stock');
    logger.error(
      '"Policy" has thrown an unhandled exception.',
      error,
      'EventBus',
    );
    logger.error(error);
    logger.error(
      '"Policy" has thrown an unhandled exception.',
      'x',
      'EventBus',
    );

    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({
      msg: '"Policy" has thrown an unhandled exception.',
      logger: 'EventBus',
      'err.type': 'RangeError',
      'err.message': 'out of stock',
      'err.stack': error.stack,
    });
    expect(lines[1]).toMatchObject({
      msg: 'out of stock',
      'err.type': 'RangeError',
      'err.stack': error.stack,
    });
    expect(lines[2]).toMatchObject({
      logger: 'EventBus',
      'err.type': 'string',
      'err.message': 'x',
    });
  });

  it('redacts customerEmail, to, email and nested *.customerEmail → "[redacted]" in stdout and in OTel attributes', () => {
    const { logger, lines } = capture();
    logger.log(
      {
        msg: 'order placed',
        customerEmail: 'ann@example.com',
        to: 'ann@example.com',
        email: 'ann@example.com',
        orderId: 'o-1',
      },
      'Test',
    );
    logger.log(
      'summary sent',
      { order: { customerEmail: 'ann@example.com', total: 5 } },
      'Test',
    );
    logger.log(
      'mail',
      { mail: { to: 'ann@example.com' }, user: { email: 'ann@example.com' } },
      'Test',
    );

    const stdout = JSON.stringify(lines);
    const otel = JSON.stringify(records().map((r) => [r.body, r.attributes]));
    expect(stdout).not.toContain('ann@example.com');
    expect(otel).not.toContain('ann@example.com');

    expect(lines[0]).toMatchObject({
      msg: 'order placed',
      customerEmail: '[redacted]',
      to: '[redacted]',
      email: '[redacted]',
      orderId: 'o-1',
    });
    expect(lines[1]).toMatchObject({
      msg: 'summary sent',
      order: { customerEmail: '[redacted]', total: 5 },
    });
    expect(lines[2]).toMatchObject({
      mail: { to: '[redacted]' },
      user: { email: '[redacted]' },
    });
    expect(records()[1].attributes).toMatchObject({
      order: { customerEmail: '[redacted]', total: 5 },
    });
  });

  it('redacts deep, array and *Email fields, and survives a cycle, in stdout and in OTel attributes', () => {
    const { logger, lines } = capture();
    const cyclic: Record<string, unknown> = {
      recipientEmail: 'ann@example.com',
    };
    cyclic.self = cyclic;
    logger.log(
      'deep',
      {
        order: { customer: { email: 'ann@example.com' } },
        recipientEmail: 'ann@example.com',
        events: [{ customerEmail: 'ann@example.com' }, { total: 1 }],
        cyclic,
      },
      'Test',
    );

    expect(JSON.stringify(lines)).not.toContain('ann@example.com');
    expect(
      JSON.stringify(records().map((r) => [r.body, r.attributes])),
    ).not.toContain('ann@example.com');
    expect(lines[0]).toMatchObject({
      order: { customer: { email: '[redacted]' } },
      recipientEmail: '[redacted]',
      events: [{ customerEmail: '[redacted]' }, { total: 1 }],
    });
  });

  it("scrubs a failed query's bound parameters from msg, err.message and err.stack", () => {
    const { logger, lines } = capture();
    const error = new DrizzleQueryError(
      'insert into "t" ("email") values ($1)',
      ['a@b.cz'],
      new Error('connection lost'),
    );
    logger.error(error, 'Test');
    logger.error('failed', error.stack, 'Test');
    logger.error('wrapped', error, 'Test');

    expect(lines).toHaveLength(3);
    expect(JSON.stringify(lines)).not.toContain('a@b.cz');
    expect(
      JSON.stringify(records().map((r) => [r.body, r.attributes])),
    ).not.toContain('a@b.cz');
    expect(lines[0]['err.message']).toContain('Failed query: insert into');
  });

  const orderPlaced = () =>
    new OrderPlaced({
      orderId: 'o-9',
      customerEmail: 'ann@example.com',
      lines: [{ sku: 'MUG-01', quantity: 1, unitPrice: 5 }],
      total: 5,
    });

  it('redacts class instances nested under a key (a domain event) in stdout and OTel attributes', () => {
    const { logger, lines } = capture();
    const event = orderPlaced();
    logger.log({ msg: 'placed', event }, 'Test');
    logger.log('placed', { event }, 'Test');

    expect(JSON.stringify(lines)).not.toContain('ann@example.com');
    expect(
      JSON.stringify(records().map((r) => [r.body, r.attributes])),
    ).not.toContain('ann@example.com');
    for (const line of lines) {
      expect(line).toMatchObject({
        msg: 'placed',
        event: { orderId: 'o-9', customerEmail: '[redacted]', total: 5 },
      });
    }
    for (const record of records()) {
      expect(record.attributes).toMatchObject({
        event: { orderId: 'o-9', customerEmail: '[redacted]', total: 5 },
      });
    }
    expect(event.customerEmail).toBe('ann@example.com');
  });

  it('a class instance as a positional param becomes fields (log and error), redacted, no err.*', () => {
    const { logger, lines } = capture();
    logger.log('placed', orderPlaced(), 'Test');
    logger.error('failed', orderPlaced(), 'Test');

    expect(lines.map((l) => [l.level, l.msg])).toEqual([
      ['info', 'placed'],
      ['error', 'failed'],
    ]);
    for (const [i, line] of lines.entries()) {
      expect(line).toMatchObject({
        orderId: 'o-9',
        customerEmail: '[redacted]',
        total: 5,
      });
      expect(Object.keys(line).filter((k) => k.startsWith('err.'))).toEqual([]);
      expect(records()[i].attributes).toMatchObject({
        orderId: 'o-9',
        customerEmail: '[redacted]',
      });
      expect(records()[i].attributes).not.toHaveProperty('err.type');
    }
    expect(
      JSON.stringify([lines, records().map((r) => r.attributes)]),
    ).not.toContain('ann@example.com');
  });

  it('does not mutate the objects it is given', () => {
    const { logger } = capture();
    const order = { customerEmail: 'ann@example.com' };
    logger.log('placed', { order }, 'Test');
    expect(order.customerEmail).toBe('ann@example.com');
  });

  it('inside a handler context: app.module, app.handler, app.order_id, app.event present', () => {
    const { logger, lines } = capture();
    runInHandlerContext(
      {
        module: 'notifications',
        handler: 'SendOrderSummaryPolicy',
        event: 'OrderPlaced',
        orderId: 'o-7',
      },
      () => logger.log('sending summary', 'SendOrderSummaryPolicy'),
    );
    logger.log('outside', 'Test');

    const app = {
      'app.module': 'notifications',
      'app.handler': 'SendOrderSummaryPolicy',
      'app.event': 'OrderPlaced',
      'app.order_id': 'o-7',
    };
    expect(lines[0]).toMatchObject(app);
    expect(records()[0].attributes).toMatchObject(app);
    expect(Object.keys(lines[1]).filter((k) => k.startsWith('app.'))).toEqual(
      [],
    );
  });
});
