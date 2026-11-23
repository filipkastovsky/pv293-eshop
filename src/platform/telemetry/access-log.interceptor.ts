import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { context as otelContext } from '@opentelemetry/api';
import { getRPCMetadata } from '@opentelemetry/core';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

const HEALTH_ROUTE = '/health';

/**
 * One record per HTTP request, written when the response is finished, so the status is the
 * one the client got (exception filters included): `info` below 400, `warn` for 4xx, `error`
 * for 5xx; `GET /health` (probes) is `debug`. When the route has an `:orderId` param, it is set
 * as `app.order_id` on the server span and on the record. The record keeps the request's trace context. It goes through Nest's `Logger`,
 * like every other log line, so it lands wherever `app.useLogger` points.
 */
@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AccessLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const started = performance.now();
    const active = otelContext.active();
    const orderId = orderIdOf(req);
    // The HTTP server span, not the express layer span that is active here.
    if (orderId)
      getRPCMetadata(active)?.span.setAttribute('app.order_id', orderId);
    const route = routeOf(req);

    res.once('finish', () => {
      const status = res.statusCode;
      const fields = {
        msg: 'request completed',
        'http.request.method': req.method,
        'http.route': route,
        ...(orderId ? { 'app.order_id': orderId } : {}),
        'http.response.status_code': status,
        duration_ms: Math.round((performance.now() - started) * 10) / 10,
      };
      otelContext.with(active, () => {
        if (status >= 500) this.logger.error(fields);
        else if (status >= 400) this.logger.warn(fields);
        // Probes hit this every few seconds; keep it out of `info`.
        else if (route === HEALTH_ROUTE) this.logger.debug(fields);
        else this.logger.log(fields);
      });
    });

    return next.handle();
  }
}

/** The route template (`/orders/:id`), never the raw path with ids in it. */
function routeOf(req: Request): string | undefined {
  const path: unknown = req.route?.path;
  if (typeof path !== 'string') return undefined;
  return `${req.baseUrl ?? ''}${path}`;
}

function orderIdOf(req: Request): string | undefined {
  const orderId: unknown = req.params?.orderId;
  return typeof orderId === 'string' && orderId !== '' ? orderId : undefined;
}
