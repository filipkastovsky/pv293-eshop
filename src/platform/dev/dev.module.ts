import { DynamicModule, Module } from '@nestjs/common';
import { DevController } from './dev.controller';

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic module convention
export class DevModule {
  /** Registers `/dev/*` only when DEV_ENDPOINTS=true, read at registration time. */
  static register(): DynamicModule {
    return {
      module: DevModule,
      controllers: process.env.DEV_ENDPOINTS === 'true' ? [DevController] : [],
    };
  }
}
