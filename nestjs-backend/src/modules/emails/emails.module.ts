import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailsAdminController } from './emails.admin.controller';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';

@Module({
  imports: [ConfigModule],
  controllers: [EmailsController, EmailsAdminController],
  providers: [EmailsService],
  exports: [EmailsService],
})
export class EmailsModule {}
