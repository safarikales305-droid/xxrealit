import { Body, Controller, Get, Patch, UseGuards, ValidationPipe } from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactMonetizationService } from './contact-monetization.service';
import { UpdateContactMonetizationDto } from './dto/update-contact-monetization.dto';

@Controller('admin/contact-monetization')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ContactMonetizationAdminController {
  constructor(private readonly monetization: ContactMonetizationService) {}

  @Get()
  getSettings() {
    return this.monetization.getSettings();
  }

  @Patch()
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateContactMonetizationDto,
  ) {
    return this.monetization.updateSettings(dto);
  }
}
