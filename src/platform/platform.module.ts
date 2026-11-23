import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { OpenTelemetryModule } from 'nestjs-otel';
import { ChaosModule } from './chaos/chaos.service';
import { DbModule } from './db/db.module';
import { DevModule } from './dev/dev.module';
import { AccessLogInterceptor } from './telemetry/access-log.interceptor';
import { HandlerTracing } from './telemetry/handler-tracing';
import { PlatformLogger } from './telemetry/logger';
import { TracingPublisherInstaller } from './telemetry/tracing-publisher';
import { TimelineModule } from './timeline/timeline.module';

/** Shared infrastructure: db, event bus, chaos, timeline, telemetry, dev endpoints (opt-in). */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic module convention
export class PlatformModule {
  static register(): DynamicModule {
    return {
      module: PlatformModule,
      imports: [
        DbModule,
        CqrsModule.forRoot(),
        OpenTelemetryModule.forRoot(),
        ChaosModule,
        TimelineModule,
        DevModule.register(),
      ],
      providers: [
        TracingPublisherInstaller,
        HandlerTracing,
        { provide: PlatformLogger, useFactory: () => new PlatformLogger() },
        { provide: APP_INTERCEPTOR, useClass: AccessLogInterceptor },
      ],
      exports: [PlatformLogger],
    };
  }
}
