import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailsAdminController } from './emails.admin.controller';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { EmailSettingsService } from './email-settings.service';

@Module({
  imports: [ConfigModule],
  controllers: [EmailsController, EmailsAdminController],
  providers: [EmailsService, EmailSettingsService],
  exports: [EmailsService, EmailSettingsService],
})
export class EmailsModule {}
