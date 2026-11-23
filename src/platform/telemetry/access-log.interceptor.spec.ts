import { EventEmitter } from 'node:events';
import { ExecutionContext, Logger } from '@nestjs/common';
import { context, trace } from '@opentelemetry/api';
import { RPCType, setRPCMetadata } from '@opentelemetry/core';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { of } from 'rxjs';
import { AccessLogInterceptor } from './access-log.interceptor';
import { startTelemetry } from './telemetry';

const exporter = new InMemorySpanExporter();
startTelemetry({ spanExporter: exporter, env: {} });

/** One request through the interceptor; resolves with the server span's attributes. */
function request(route: string, params: Record<string, string>, status = 200) {
  const req = { method: 'GET', baseUrl: '', route: { path: route }, params };
  const res = Object.assign(new EventEmitter(), { statusCode: status });
  const http = { getRequest: () => req, getResponse: () => res };
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => http,
  } as unknown as ExecutionContext;

  const server = trace.getTracer('test').startSpan('GET');
  const withServer = setRPCMetadata(trace.setSpan(context.active(), server), {
    type: RPCType.HTTP,
    span: server,
  });
  context.with(withServer, () => {
    // An inner (express-like) span is the active one, as under the real instrumentation.
    const inner = trace.getTracer('test').startSpan('router');
    context.with(trace.setSpan(context.active(), inner), () => {
      void new AccessLogInterceptor()
        .intercept(ctx, { handle: () => of(null) })
        .subscribe();
      res.emit('finish');
    });
    inner.end();
  });
  server.end();
  const spans = exporter.getFinishedSpans();
  return spans.find((s) => s.name === 'GET')?.attributes ?? {};
}

describe('AccessLogInterceptor', () => {
  let log: jest.SpyInstance;
  let debug: jest.SpyInstance;
  beforeEach(() => {
    exporter.reset();
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
  });
  afterEach(() => jest.restoreAllMocks());

  it('a route with :orderId puts app.order_id on the server span and in the access record', () => {
    const attributes = request('/orders/:orderId/timeline', { orderId: 'o-1' });
    expect(attributes['app.order_id']).toBe('o-1');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        'http.route': '/orders/:orderId/timeline',
        'app.order_id': 'o-1',
      }),
    );
  });

  it('a route without :orderId carries no app.order_id', () => {
    const attributes = request('/catalog/products', {});
    expect(attributes).not.toHaveProperty('app.order_id');
    expect(log).toHaveBeenCalledWith(
      expect.not.objectContaining({ 'app.order_id': expect.anything() }),
    );
  });

  it('GET /health is logged at debug, not info', () => {
    request('/health', {});
    expect(debug).toHaveBeenCalledWith(
      expect.objectContaining({ 'http.route': '/health' }),
    );
    expect(log).not.toHaveBeenCalled();
  });
});
