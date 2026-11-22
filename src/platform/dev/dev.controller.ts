import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { EventBus } from '@nestjs/cqrs';
import {
  eventFromJson,
  InvalidEventPayloadError,
  UnknownEventError,
} from '../../contracts';
import { ChaosService } from '../chaos/chaos.service';

@Controller('dev')
export class DevController {
  constructor(
    private readonly eventBus: EventBus,
    private readonly chaos: ChaosService,
  ) {}

  @Post('emit/:eventName')
  @HttpCode(202)
  emit(@Param('eventName') eventName: string, @Body() payload: unknown) {
    try {
      this.eventBus.publish(eventFromJson(eventName, payload));
    } catch (err) {
      if (
        err instanceof UnknownEventError ||
        err instanceof InvalidEventPayloadError
      ) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
    return { emitted: eventName };
  }

  @Post('chaos')
  @HttpCode(202)
  arm(@Body() body: { handler?: unknown }) {
    if (typeof body?.handler !== 'string' || body.handler === '') {
      throw new BadRequestException('handler (string) is required');
    }
    this.chaos.arm(body.handler);
    return { armed: body.handler };
  }
}
