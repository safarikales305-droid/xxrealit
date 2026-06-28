import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { SocialPublishStatus } from '@prisma/client';
import { AdminGuard } from '../../admin/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../../auth/decorators/current-user.decorator';
import { PrismaService } from '../../../database/prisma.service';
import { SocialAutopostSettingsService } from './social-autopost-settings.service';
import { SocialPublisherService } from './social-publisher.service';
import {
  SocialPublishEnqueueService,
  SocialPublishProcessorService,
} from './social-publish-enqueue.service';
import { SocialPublishScheduleService } from './social-publish-schedule.service';
import {
  ManualSocialEnqueueDto,
  PropertyFacebookStatusQueryDto,
  PropertyIdsDto,
  PropertyPublishNowDto,
  PropertyScheduleDto,
  SocialQueueQueryDto,
  UpdateFacebookAutopostDto,
} from './dto/social-autopost-admin.dto';

@Controller('social/autopost/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class SocialAutopostAdminController {
  constructor(
    private readonly settings: SocialAutopostSettingsService,
    private readonly publisher: SocialPublisherService,
    private readonly publishEnqueue: SocialPublishEnqueueService,
    private readonly processor: SocialPublishProcessorService,
    private readonly scheduleService: SocialPublishScheduleService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings();
  }

  @Patch('settings/facebook')
  updateFacebook(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateFacebookAutopostDto,
  ) {
    const { facebookEnabled, ...rest } = dto;
    const patch = {
      ...rest,
      ...(facebookEnabled !== undefined ? { enabled: facebookEnabled } : {}),
    };
    return this.settings.updateSettings({
      facebook: patch,
    });
  }

  @Post('facebook/test-connection')
  testConnection() {
    return this.publisher.testFacebookConnection();
  }

  @Post('facebook/test-publish')
  testPublish() {
    return this.publisher.testFacebookPublish();
  }

  @Get('queue')
  async listQueue(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    query: SocialQueueQueryDto,
  ) {
    const status = query.status?.trim().toUpperCase();
    const contentType = query.contentType?.trim().toUpperCase();
    const rows = await this.prisma.socialPublishQueue.findMany({
      where: {
        ...(status && Object.values(SocialPublishStatus).includes(status as SocialPublishStatus)
          ? { status: status as SocialPublishStatus }
          : {}),
        ...(contentType ? { contentType: contentType as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        author: { select: { id: true, name: true, role: true } },
      },
    });
    return { items: rows };
  }

  @Post('enqueue')
  manualEnqueue(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: ManualSocialEnqueueDto,
  ) {
    return this.publishEnqueue.enqueueManual({
      ...dto,
      triggeredByUserId: user?.id,
    });
  }

  @Get('properties/facebook-status')
  propertyFacebookStatus(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    query: PropertyFacebookStatusQueryDto,
  ) {
    const ids = query.ids
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return this.scheduleService.getFacebookStatus(ids);
  }

  @Post('properties/publish-now')
  propertyPublishNow(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PropertyPublishNowDto,
  ) {
    return this.scheduleService.publishNow(dto.propertyIds, user?.id, dto.force);
  }

  @Post('properties/schedule')
  propertySchedule(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PropertyScheduleDto,
  ) {
    return this.scheduleService.upsertSchedules(dto, user?.id);
  }

  @Post('properties/schedule/cancel')
  propertyScheduleCancel(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PropertyIdsDto,
  ) {
    return this.scheduleService.cancelSchedules(dto.propertyIds);
  }

  @Get('properties/:id/publish-log')
  propertyPublishLog(@Param('id') id: string) {
    return this.scheduleService.getPublishLog(id).then((items) => ({ items }));
  }

  @Post('queue/:id/retry')
  retry(@Param('id') id: string) {
    return this.publishEnqueue.retryQueueItem(id);
  }

  @Post('queue/:id/skip')
  skip(@Param('id') id: string) {
    return this.publishEnqueue.skipQueueItem(id);
  }

  @Post('queue/:id/process')
  processNow(@Param('id') id: string) {
    return this.processor.processItem(id);
  }
}
