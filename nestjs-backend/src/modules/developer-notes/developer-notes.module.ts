import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeveloperNotesAdminController } from './developer-notes-admin.controller';
import { DeveloperNotesService } from './developer-notes.service';

@Module({
  imports: [AuthModule],
  controllers: [DeveloperNotesAdminController],
  providers: [DeveloperNotesService],
})
export class DeveloperNotesModule {}
