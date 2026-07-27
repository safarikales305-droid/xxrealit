import { Module } from '@nestjs/common';
import { EmailsModule } from '../emails/emails.module';
import { EmailCenterAdminController } from './email-center.admin.controller';
import { EmailCenterService } from './email-center.service';

@Module({
  imports: [EmailsModule],
  controllers: [EmailCenterAdminController],
  providers: [EmailCenterService],
  exports: [EmailCenterService],
})
export class EmailCenterModule {}
