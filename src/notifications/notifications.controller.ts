import { Controller, Get } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly email: EmailService) {}

  @Get()
  list() {
    return this.email.list();
  }
}
