import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SocialModule } from '../social/social.module';
import { OPortaluAdminController } from './o-portalu-admin.controller';
import { OPortaluPublicController } from './o-portalu-public.controller';
import { OPortaluStatsImportService } from './o-portalu-stats-import.service';
import { OPortaluService } from './o-portalu.service';

@Module({
  imports: [forwardRef(() => AuthModule), forwardRef(() => SocialModule)],
  controllers: [OPortaluPublicController, OPortaluAdminController],
  providers: [OPortaluService, OPortaluStatsImportService],
  exports: [OPortaluService],
})
export class OPortaluModule {}
