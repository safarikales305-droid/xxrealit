import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OPortaluAdminController } from './o-portalu-admin.controller';
import { OPortaluPublicController } from './o-portalu-public.controller';
import { OPortaluService } from './o-portalu.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [OPortaluPublicController, OPortaluAdminController],
  providers: [OPortaluService],
  exports: [OPortaluService],
})
export class OPortaluModule {}
