import { Body, Controller, Get, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthUser } from '../../auth/decorators/current-user.decorator';
import { FacebookConnectDto } from '../dto/facebook-connect.dto';
import { FacebookUploadVideoDto } from '../dto/facebook-upload-video.dto';
import { FacebookService } from './facebook.service';

@Controller('social/facebook')
export class FacebookController {
  constructor(private readonly facebook: FacebookService) {}

  /** Veřejná konfigurace pro frontend (app id, zda je upload dostupný). */
  @Get('config')
  getConfig() {
    return this.facebook.getPublicConfig();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: AuthUser) {
    return this.facebook.getConnectionStatus(user.id);
  }

  @Post('connect')
  @UseGuards(JwtAuthGuard)
  connect(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: FacebookConnectDto,
  ) {
    return this.facebook.connect(user.id, dto);
  }

  @Post('upload-video')
  @UseGuards(JwtAuthGuard)
  uploadVideo(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: FacebookUploadVideoDto,
  ) {
    return this.facebook.uploadVideo(user.id, dto);
  }
}
