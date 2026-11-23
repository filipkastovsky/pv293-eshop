import { Global, Injectable, Module } from '@nestjs/common';
import { trace } from '@opentelemetry/api';

export class ChaosError extends Error {
  constructor(readonly handler: string) {
    super(`Chaos: injected failure in ${handler}`);
    this.name = 'ChaosError';
  }
}

/** Dev-only failure injection: arm a handler name, its next `maybeFail` call throws once. */
@Injectable()
export class ChaosService {
  private readonly armed = new Set<string>();

  arm(handlerName: string): void {
    this.armed.add(handlerName);
  }

  maybeFail(handlerName: string): void {
    if (!this.armed.delete(handlerName)) return;
    trace
      .getActiveSpan()
      ?.addEvent('chaos.injected', { 'app.handler': handlerName });
    throw new ChaosError(handlerName);
  }
}

@Global()
@Module({ providers: [ChaosService], exports: [ChaosService] })
export class ChaosModule {}
