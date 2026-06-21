import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { SubscribeWebPushDto } from './dto/subscribe-web-push.dto';
import { UpdateNotificationPrefsDto } from './dto/update-notification-prefs.dto';
import { AdminGuard } from '../admin/guards/admin.guard';
import { WebPushService } from './web-push.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class WebPushController {
  constructor(private readonly webPush: WebPushService) {}

  @Get('push/vapid-public-key')
  vapidPublicKey() {
    const publicKey = this.webPush.getVapidPublicKey();
    return { publicKey, configured: Boolean(publicKey) };
  }

  @UseGuards(AdminGuard)
  @Get('push/admin-status')
  adminPushStatus() {
    return this.webPush.getAdminStatus();
  }

  @Get('users/me/notification-prefs')
  getPrefs(@CurrentUser() user: AuthUser) {
    return this.webPush.getNotificationPrefs(user.id);
  }

  @Patch('users/me/notification-prefs')
  patchPrefs(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateNotificationPrefsDto,
  ) {
    return this.webPush.updateNotificationPrefs(user.id, dto);
  }

  @Post('push/subscribe')
  subscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: SubscribeWebPushDto,
  ) {
    return this.webPush.subscribe(user.id, dto);
  }

  @Delete('push/subscribe')
  unsubscribe(@CurrentUser() user: AuthUser, @Query('endpoint') endpoint?: string) {
    return this.webPush.unsubscribe(user.id, endpoint);
  }
}
