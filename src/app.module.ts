import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PlatformModule } from './platform';

@Module({
  imports: [PlatformModule.register()],
  controllers: [HealthController],
})
export class AppModule {}
