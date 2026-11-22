import { Module } from '@nestjs/common';
import { TimelineController } from './timeline.controller';
import { TimelineRecorder } from './timeline.recorder';

@Module({
  controllers: [TimelineController],
  providers: [TimelineRecorder],
})
export class TimelineModule {}
