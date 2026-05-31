import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TiparController } from './tipar.controller';
import { TiparService } from './tipar.service';

@Module({
  imports: [AuthModule],
  controllers: [TiparController],
  providers: [TiparService],
  exports: [TiparService],
})
export class TiparModule {}
