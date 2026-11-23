import { DynamicModule, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { OpenTelemetryModule } from 'nestjs-otel';
import { ChaosModule } from './chaos/chaos.service';
import { DbModule } from './db/db.module';
import { DevModule } from './dev/dev.module';
import { HandlerTracing } from './telemetry/handler-tracing';
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
      providers: [TracingPublisherInstaller, HandlerTracing],
    };
  }
}
