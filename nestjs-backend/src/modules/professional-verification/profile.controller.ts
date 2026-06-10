import { Body, Controller, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequestProfessionalVerificationDto } from './dto/request-professional-verification.dto';
import { ProfessionalVerificationService } from './professional-verification.service';

@Controller('profile')
export class ProfileController {
  constructor(private readonly professionalVerification: ProfessionalVerificationService) {}

  @UseGuards(JwtAuthGuard)
  @Post('request-verification')
  requestVerification(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RequestProfessionalVerificationDto,
  ) {
    return this.professionalVerification.requestVerification(user.id, dto);
  }
}
