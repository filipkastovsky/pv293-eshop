import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { NotificationsController } from './notifications.controller';
import { SendCancellationNoticePolicy } from './send-cancellation-notice.policy';
import { SendOrderSummaryPolicy } from './send-order-summary.policy';

@Module({
  controllers: [NotificationsController],
  providers: [
    EmailService,
    SendOrderSummaryPolicy,
    SendCancellationNoticePolicy,
  ],
})
export class NotificationsModule {}
