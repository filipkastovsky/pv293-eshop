import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DbModule } from './platform';

@Module({
  imports: [DbModule],
  controllers: [HealthController],
})
export class AppModule {}
