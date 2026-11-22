import { DynamicModule, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { ChaosModule } from './chaos/chaos.service';
import { DbModule } from './db/db.module';
import { DevModule } from './dev/dev.module';
import { TimelineModule } from './timeline/timeline.module';

/** Shared infrastructure: db, event bus, chaos, timeline, dev endpoints (opt-in). */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic module convention
export class PlatformModule {
  static register(): DynamicModule {
    return {
      module: PlatformModule,
      imports: [
        DbModule,
        CqrsModule.forRoot(),
        ChaosModule,
        TimelineModule,
        DevModule.register(),
      ],
    };
  }
}
