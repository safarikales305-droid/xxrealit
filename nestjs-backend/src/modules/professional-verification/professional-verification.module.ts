import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileController } from './profile.controller';
import { ProfessionalVerificationService } from './professional-verification.service';

@Module({
  imports: [AuthModule],
  controllers: [ProfileController],
  providers: [ProfessionalVerificationService],
  exports: [ProfessionalVerificationService],
})
export class ProfessionalVerificationModule {}
