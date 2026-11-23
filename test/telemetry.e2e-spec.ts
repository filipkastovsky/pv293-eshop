import { randomUUID } from 'node:crypto';
import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { SeverityNumber, SpanKind, SpanStatusCode } from '@opentelemetry/api';
import type { ReadableLogRecord } from '@opentelemetry/sdk-logs';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { DrizzleQueryError } from 'drizzle-orm';
import { OrderPlaced } from '../src/contracts';
import { bootTestApp, TestApp } from './support/app';
import { logs, spans } from './support/telemetry';

const DB_ERROR_EMAIL = 'a@b.cz';

/** Throws for orders whose id says so: an Error for `boom-*`, a plain string for `str-*`, a failed query for `db-*`. */
@EventsHandler(OrderPlaced)
class ExplodingTestPolicy implements IEventHandler<OrderPlaced> {
  handle(event: OrderPlaced): void {
    if (event.orderId.startsWith('boom-')) throw new Error('boom');
    if (event.orderId.startsWith('str-')) throw 'x';
    if (event.orderId.startsWith('db-')) {
      throw new DrizzleQueryError(
        'insert into "orders" ("customer_email") values ($1)',
        [DB_ERROR_EMAIL],
        new Error('null value in column "x" violates not-null constraint'),
      );
    }
  }
}

const placed = (orderId: string, customerEmail = 'ann@example.com') => ({
  orderId,
  customerEmail,
  lines: [{ sku: 'MUG-01', quantity: 1, unitPrice: 5 }],
  total: 5,
});

async function waitForSpan(
  predicate: (s: ReadableSpan) => boolean,
  timeoutMs = 5_000,
): Promise<ReadableSpan> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = spans.getFinishedSpans().find(predicate);
    if (found) return found;
    if (Date.now() > deadline) {
      const names = spans.getFinishedSpans().map((s) => s.name);
      throw new Error(`No matching span. Finished: [${names.join(', ')}]`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function waitForLog(
  predicate: (r: ReadableLogRecord) => boolean,
  timeoutMs = 5_000,
): Promise<ReadableLogRecord> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = logs.getFinishedLogRecords().find(predicate);
    if (found) return found;
    if (Date.now() > deadline) {
      const bodies = logs.getFinishedLogRecords().map((r) => r.body);
      throw new Error(`No matching log record. Got: ${JSON.stringify(bodies)}`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
}

const forOrder = (name: string, orderId: string) => (s: ReadableSpan) =>
  s.name === name && s.attributes['app.order_id'] === orderId;

const processSpan = (orderId: string, handler: string) => (s: ReadableSpan) =>
  forOrder('process OrderPlaced', orderId)(s) &&
  s.attributes['app.handler'] === handler;

describe('telemetry', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await bootTestApp({ providers: [ExplodingTestPolicy] });
  });
  afterAll(() => t.close());

  it('one trace: publish OrderPlaced → process OrderPlaced (SendOrderSummaryPolicy) → publish OrderSummarySent', async () => {
    const orderId = `ok-${randomUUID()}`;
    await t.emit('OrderPlaced', placed(orderId));

    const publish = await waitForSpan(forOrder('publish OrderPlaced', orderId));
    expect(publish.kind).toBe(SpanKind.PRODUCER);
    expect(publish.attributes).toMatchObject({
      'messaging.system': 'nestjs-cqrs',
      'messaging.operation.type': 'send',
      'messaging.destination.name': 'OrderPlaced',
      'app.order_id': orderId,
    });

    const process = await waitForSpan(
      processSpan(orderId, 'SendOrderSummaryPolicy'),
    );
    expect(process.kind).toBe(SpanKind.CONSUMER);
    expect(process.parentSpanContext?.spanId).toBe(
      publish.spanContext().spanId,
    );
    expect(process.attributes).toMatchObject({
      'messaging.system': 'nestjs-cqrs',
      'messaging.operation.type': 'process',
      'messaging.destination.name': 'OrderPlaced',
      'app.handler': 'SendOrderSummaryPolicy',
      'app.module': 'notifications',
      'app.order_id': orderId,
    });
    expect(process.status.code).not.toBe(SpanStatusCode.ERROR);

    const next = await waitForSpan(
      forOrder('publish OrderSummarySent', orderId),
    );
    expect(next.kind).toBe(SpanKind.PRODUCER);
    expect(next.parentSpanContext?.spanId).toBe(process.spanContext().spanId);

    const traceIds = new Set(
      [publish, process, next].map((s) => s.spanContext().traceId),
    );
    expect(traceIds.size).toBe(1);
  });

  it('chaos → ERROR span with chaos.injected event, timeline names the policy', async () => {
    const orderId = `chaos-${randomUUID()}`;
    await t
      .http()
      .post('/dev/chaos')
      .send({ handler: 'SendOrderSummaryPolicy' })
      .expect(202);
    await t.emit('OrderPlaced', placed(orderId));

    const entries = await t.waitForTimeline(orderId, [
      'OrderPlaced',
      'SendOrderSummaryPolicy',
    ]);
    expect(entries.find((e) => e.kind === 'handler_failed')?.name).toBe(
      'SendOrderSummaryPolicy',
    );

    const span = await waitForSpan(
      processSpan(orderId, 'SendOrderSummaryPolicy'),
    );
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    const chaos = span.events.find((e) => e.name === 'chaos.injected');
    expect(chaos?.attributes).toEqual({
      'app.handler': 'SendOrderSummaryPolicy',
    });

    // The bus's error log for this failure sits in the same trace as the ERROR span.
    const traceId = span.spanContext().traceId;
    const error = await waitForLog(
      (r) =>
        r.severityNumber === SeverityNumber.ERROR &&
        r.spanContext?.traceId === traceId,
    );
    expect(error.body).toContain('SendOrderSummaryPolicy');
    expect(error.attributes).toMatchObject({
      logger: 'EventBus',
      'err.type': 'ChaosError',
      'err.message': 'Chaos: injected failure in SendOrderSummaryPolicy',
    });
  });

  // Jest bypasses the http instrumentation's require hook, so there is no SERVER span here;
  // the access record's trace correlation is checked against the built app instead.
  it('access log: one record per request with the route template, status and duration', async () => {
    const orderId = `http-${randomUUID()}`;
    logs.reset();
    await t.emit('OrderPlaced', placed(orderId));

    const access = await waitForLog(
      (r) =>
        r.body === 'request completed' &&
        r.attributes['http.route'] === '/dev/emit/:eventName',
    );
    expect(access.severityNumber).toBe(SeverityNumber.INFO);
    expect(access.attributes).toMatchObject({
      logger: 'AccessLog',
      'http.request.method': 'POST',
      'http.route': '/dev/emit/:eventName',
      'http.response.status_code': 202,
    });
    expect(typeof access.attributes.duration_ms).toBe('number');

    const missing = await t.http().post('/dev/emit/NoSuchEvent').send({});
    expect(missing.status).toBe(400);
    const warn = await waitForLog(
      (r) =>
        r.body === 'request completed' &&
        r.attributes['http.response.status_code'] === missing.status,
    );
    expect(warn.severityNumber).toBe(SeverityNumber.WARN);
  });

  it('access log: a route with :orderId carries app.order_id; GET /health is not logged at info', async () => {
    const orderId = `route-${randomUUID()}`;
    logs.reset();
    await t.http().get('/health').expect(200);
    await t.http().get(`/orders/${orderId}/timeline`).expect(200);

    const access = await waitForLog(
      (r) =>
        r.body === 'request completed' &&
        r.attributes['http.route'] === '/orders/:orderId/timeline',
    );
    expect(access.attributes).toMatchObject({ 'app.order_id': orderId });

    const info = logs
      .getFinishedLogRecords()
      .filter(
        (r) =>
          r.body === 'request completed' &&
          r.attributes['http.route'] === '/health',
      );
    expect(info).toEqual([]);
  });

  it('non-chaos Error from a handler → ERROR span with exception event; timeline handler_failed name = handler class', async () => {
    const orderId = `boom-${randomUUID()}`;
    await t.emit('OrderPlaced', placed(orderId));

    const entries = await t.waitForTimeline(orderId, ['OrderPlaced']);
    const failed = await waitForFailure(orderId);
    expect(failed).toMatchObject({
      kind: 'handler_failed',
      name: 'ExplodingTestPolicy',
    });
    expect(entries[0].name).toBe('OrderPlaced');

    const span = await waitForSpan(processSpan(orderId, 'ExplodingTestPolicy'));
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    const exception = span.events.find((e) => e.name === 'exception');
    expect(exception?.attributes?.['exception.message']).toBe('boom');
  });

  it('handler throwing a string → ERROR span; timeline name = handler class', async () => {
    const orderId = `str-${randomUUID()}`;
    await t.emit('OrderPlaced', placed(orderId));

    const failed = await waitForFailure(orderId);
    expect(failed).toMatchObject({
      kind: 'handler_failed',
      name: 'ExplodingTestPolicy',
      payload: { error: 'x', event: 'OrderPlaced' },
    });
    const span = await waitForSpan(processSpan(orderId, 'ExplodingTestPolicy'));
    expect(span.status.code).toBe(SpanStatusCode.ERROR);

    // The bus is unaffected: the other policy still ran, and later events still flow.
    await t.waitForTimeline(orderId, ['OrderPlaced', 'OrderSummarySent']);
    const later = `ok-${randomUUID()}`;
    await t.emit('OrderPlaced', placed(later));
    await t.waitForTimeline(later, ['OrderPlaced', 'OrderSummarySent']);
  });

  it("a failed query's bound parameters (the customer email) reach no span, log record or timeline entry", async () => {
    const orderId = `db-${randomUUID()}`;
    await t.emit('OrderPlaced', placed(orderId, DB_ERROR_EMAIL));

    const failed = await waitForFailure(orderId);
    expect(failed).toMatchObject({
      kind: 'handler_failed',
      name: 'ExplodingTestPolicy',
    });
    const span = await waitForSpan(processSpan(orderId, 'ExplodingTestPolicy'));
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toContain('Failed query');
    const exception = span.events.find((e) => e.name === 'exception');
    expect(exception?.attributes?.['exception.message']).toContain(
      'Failed query',
    );
    // The bus's error log for this failure, then everything that was exported.
    await waitForLog(
      (r) =>
        r.severityNumber === SeverityNumber.ERROR &&
        r.spanContext?.traceId === span.spanContext().traceId,
    );

    const everything = JSON.stringify([
      spans
        .getFinishedSpans()
        .map((s) => [s.name, s.status, s.attributes, s.events]),
      logs.getFinishedLogRecords().map((r) => [r.body, r.attributes]),
      // The OrderPlaced entry carries the event payload by design; the failure record is error text.
      failed,
    ]);
    expect(everything).not.toContain(DB_ERROR_EMAIL);
  });

  it('no span attribute anywhere contains the customer email', async () => {
    const email = `pii-${randomUUID()}@example.com`;
    const orderId = `pii-${randomUUID()}`;
    await t.emit('OrderPlaced', placed(orderId, email));
    await waitForSpan(forOrder('publish OrderSummarySent', orderId));

    const all = spans.getFinishedSpans();
    expect(all.length).toBeGreaterThan(0);
    for (const s of all) {
      const attributes = [s.attributes, ...s.events.map((e) => e.attributes)];
      expect(JSON.stringify(attributes)).not.toContain(email);
      expect(s.name).not.toContain(email);
    }

    const records = logs.getFinishedLogRecords();
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(JSON.stringify([r.body, r.attributes])).not.toContain(email);
    }
  });

  async function waitForFailure(orderId: string) {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const failed = (await t.timeline(orderId)).find(
        (e) => e.kind === 'handler_failed',
      );
      if (failed) return failed;
      if (Date.now() > deadline)
        throw new Error(`no handler_failed for ${orderId}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }
});
