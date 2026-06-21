import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertySeekerService } from './property-seeker.service';

@Controller('property-seeker')
@UseGuards(JwtAuthGuard)
export class PropertySeekerController {
  constructor(private readonly propertySeeker: PropertySeekerService) {}

  @Get('me/status')
  status(@CurrentUser() user: AuthUser) {
    return this.propertySeeker.getStatus(user.id);
  }

  @Post('me/record-share')
  recordShare(@CurrentUser() user: AuthUser) {
    return this.propertySeeker.recordShare(user.id);
  }
}
