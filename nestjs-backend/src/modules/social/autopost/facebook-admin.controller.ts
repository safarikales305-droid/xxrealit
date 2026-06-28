import {
  Body,
  Controller,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialPublisherService } from './social-publisher.service';
import { SocialPublishEnqueueService } from './social-publish-enqueue.service';
import { SocialPublishScheduleService } from './social-publish-schedule.service';
import { FacebookPostDto } from './dto/facebook-post.dto';

/**
 * Veřejné admin API pro Facebook publikování — všechny Graph API volání pouze na backendu.
 * Frontend volá Next.js proxy `/api/facebook/*` → tento controller.
 */
@Controller('facebook')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FacebookAdminController {
  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly publisher: SocialPublisherService,
    private readonly publishEnqueue: SocialPublishEnqueueService,
    private readonly scheduleService: SocialPublishScheduleService,
  ) {}

  @Post('post')
  async post(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: FacebookPostDto,
  ) {
    await this.settings.reload();

    if (dto.test) {
      if (!this.settings.isFacebookPublishingConfigured()) {
        return {
          ok: false,
          error: 'Facebook není nakonfigurován — nastavte Page ID a access token.',
        };
      }
      return this.publisher.testFacebookPublish();
    }

    if (dto.propertyIds?.length) {
      if (!this.settings.isFacebookPublishingConfigured()) {
        return {
          ok: false,
          error: 'Facebook není nakonfigurován — nastavte Page ID a access token.',
        };
      }
      return this.scheduleService.publishNow(dto.propertyIds, user?.id, dto.force);
    }

    if (dto.contentType && dto.contentId) {
      if (!this.settings.isFacebookPublishingConfigured()) {
        return {
          ok: false,
          error: 'Facebook není nakonfigurován — nastavte Page ID a access token.',
        };
      }
      const enq = await this.publishEnqueue.enqueueManual({
        contentType: dto.contentType,
        contentId: dto.contentId,
        force: dto.force,
        triggeredByUserId: user?.id,
      });
      return enq;
    }

    return { ok: false, error: 'Chybí propertyIds, test nebo contentType+contentId.' };
  }

  @Post('test-connection')
  testConnection() {
    return this.publisher.testFacebookConnection();
  }
}
