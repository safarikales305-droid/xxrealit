import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { UpdateFacebookUrlImportDto } from './dto/update-facebook-url-import.dto';
import { FacebookUrlImportService } from './facebook-url-import.service';

@Controller('social/facebook-url-import')
export class FacebookUrlImportController {
  constructor(private readonly imports: FacebookUrlImportService) {}

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.imports.getStatus(user.id);
  }

  @Patch('settings')
  @UseGuards(JwtAuthGuard)
  updateSettings(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateFacebookUrlImportDto,
  ) {
    return this.imports.updateSettings(user.id, user.role as UserRole, dto);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard)
  syncNow(@CurrentUser() user: AuthUser) {
    return this.imports.syncUser(user.id, { triggeredBy: 'user' });
  }
}
