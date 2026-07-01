import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { memoryStorage } from 'multer';
import { FileInterceptor } from '@nestjs/platform-express';
import { SocialIntroPropertyType, SocialPublishStatus } from '@prisma/client';
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
  SelectFacebookAutopostPageDto,
  SocialQueueQueryDto,
  UpdateFacebookAutopostDto,
  UpdateScheduleDto,
} from './dto/social-autopost-admin.dto';
import { SocialAutopostFacebookOAuthService } from './social-autopost-facebook-oauth.service';
import {
  SocialPublishTemplatesService,
  type SocialPublishTemplatesSettings,
} from './social-publish-templates.service';
import { PostSocialPublishService } from './post-social-publish.service';
import { SocialIntroVideoService } from './social-intro-video.service';
import { PropertyMediaCloudinaryService } from '../../properties/property-media-cloudinary.service';
import { SOCIAL_INTRO_PROPERTY_TYPE_LABELS } from './social-intro-property-type.util';
import { parseDurationSecondsFromFfmpegStderr, runFfmpegCapture } from '../../../lib/ffmpeg-run';
import { resolveFfmpegBinary } from '../../../lib/ffmpeg-binary';

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
    private readonly autopostOAuth: SocialAutopostFacebookOAuthService,
    private readonly publishTemplates: SocialPublishTemplatesService,
    private readonly postSocialPublish: PostSocialPublishService,
    private readonly introVideos: SocialIntroVideoService,
    private readonly propertyMedia: PropertyMediaCloudinaryService,
  ) {}

  @Get('settings')
  getSettings() {
    return this.settings.getPublicSettings();
  }

  @Get('templates')
  getPublishTemplates() {
    return this.publishTemplates.getSettings();
  }

  @Patch('templates')
  updatePublishTemplates(@Body() body: Partial<SocialPublishTemplatesSettings>) {
    return this.publishTemplates.updateSettings(body);
  }

  @Patch('settings/global')
  updateGlobal(
    @Body()
    body: {
      autoPublishNewListings?: boolean;
      autoPublishNewPosts?: boolean;
      publishShortsAsReels?: boolean;
      publishClassicAsPhotoPost?: boolean;
      hidePublicPrice?: boolean;
      repeatPublishingEnabled?: boolean;
      videoTeaserMaxSeconds?: number;
      videoTeaserEndSlideText?: string;
      videoTeaserEndSlideEnabled?: boolean;
      publishVideosAsReels?: boolean;
      publishImagesAsPhotoPost?: boolean;
      fallbackToLinkOnMediaFailure?: boolean;
      socialVideoUsePortalTeaserRule?: boolean;
      socialVideoTeaserSeconds?: number | null;
      socialVideoPublishFull?: boolean;
    },
  ) {
    return this.settings.updateSettings({ global: body });
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

  @Patch('settings/instagram')
  updateInstagram(
    @Body()
    body: {
      enabled?: boolean;
      publishListings?: boolean;
      publishPosts?: boolean;
      publishShortsAsReels?: boolean;
      repeatPublishing?: boolean;
    },
  ) {
    return this.settings.updateSettings({ instagram: body });
  }

  @Patch('settings/youtube')
  updateYoutube(
    @Body()
    body: {
      enabled?: boolean;
      publishListings?: boolean;
      publishPosts?: boolean;
      publishShortsAsReels?: boolean;
      repeatPublishing?: boolean;
    },
  ) {
    return this.settings.updateSettings({ youtube: body });
  }

  @Patch('settings/tiktok')
  updateTiktok(
    @Body()
    body: {
      enabled?: boolean;
      publishListings?: boolean;
      publishPosts?: boolean;
      publishShortsAsReels?: boolean;
      repeatPublishing?: boolean;
    },
  ) {
    return this.settings.updateSettings({ tiktok: body });
  }

  @Post('facebook/test-connection')
  testConnection() {
    return this.publisher.testFacebookConnection();
  }

  @Post('facebook/test-publish')
  testPublish() {
    return this.publisher.testFacebookPublish();
  }

  @Get('facebook/connect')
  async connectFacebook(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const wantsJson =
      req.query.format === 'json' ||
      (req.headers.accept ?? '').includes('application/json');
    try {
      const url = await this.autopostOAuth.buildConnectUrl(user.id);
      if (wantsJson) return res.json({ url });
      return res.redirect(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Facebook OAuth není dostupné.';
      if (wantsJson) return res.status(503).json({ message, error: message });
      return res.redirect(
        `${this.autopostOAuth.getAdminSettingsUrl()}?facebook=error&reason=connect_failed`,
      );
    }
  }

  @Get('facebook/pages')
  listFacebookPages(@CurrentUser() user: AuthUser) {
    return this.autopostOAuth.listPages(user.id);
  }

  @Post('facebook/select-page')
  selectFacebookPage(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: SelectFacebookAutopostPageDto,
  ) {
    return this.autopostOAuth.selectPage(user.id, dto.pageId);
  }

  @Post('facebook/refresh-token')
  refreshFacebookToken() {
    return this.autopostOAuth.refreshPageAccessToken();
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
    return this.scheduleService.publishNow(dto.propertyIds, user?.id, dto.force, {
      publishAsReel: dto.publishAsReel,
    });
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

  @Get('schedules')
  listSchedules() {
    return this.scheduleService.listSchedules();
  }

  @Get('schedules/:id')
  getSchedule(@Param('id') id: string) {
    return this.scheduleService.getScheduleDetail(id);
  }

  @Patch('schedules/:id')
  updateSchedule(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateScheduleDto,
  ) {
    return this.scheduleService.updateScheduleById(id, dto);
  }

  @Post('schedules/:id/publish-now')
  publishScheduleNow(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.scheduleService.publishScheduleNow(id, user?.id);
  }

  @Post('schedules/:id/pause')
  pauseSchedule(@Param('id') id: string) {
    return this.scheduleService.pauseSchedule(id);
  }

  @Post('schedules/:id/resume')
  resumeSchedule(@Param('id') id: string) {
    return this.scheduleService.resumeSchedule(id);
  }

  @Delete('schedules/:id')
  deleteSchedule(@Param('id') id: string) {
    return this.scheduleService.deleteSchedule(id);
  }

  @Get('properties/:id/publish-log')
  propertyPublishLog(@Param('id') id: string) {
    return this.scheduleService.getPublishLog(id).then((items) => ({ items }));
  }

  @Get('posts/:id/social-publish')
  async postSocialPublishStatus(@Param('id') id: string) {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        description: true,
        videoUrl: true,
        facebookPermalink: true,
        facebookPostType: true,
        media: { orderBy: { order: 'asc' } },
      },
    });
    if (!post) return { ok: false, error: 'Příspěvek nenalezen' };
    const platforms = await this.postSocialPublish.listForPost(id);
    const queue = await this.prisma.socialPublishQueue.findUnique({
      where: {
        platform_contentType_contentId: {
          platform: 'FACEBOOK',
          contentType: 'POST',
          contentId: id,
        },
      },
    });
    const logs = await this.prisma.socialPublishLog.findMany({
      where: { contentType: 'POST', contentId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return { ok: true, post, platforms, queue, logs };
  }

  @Post('posts/publish-now')
  async postsPublishNow(
    @CurrentUser() user: AuthUser,
    @Body() body: { postIds: string[]; force?: boolean; publishAsReel?: boolean },
  ) {
    const ids = Array.isArray(body.postIds) ? body.postIds.map((x) => String(x).trim()).filter(Boolean) : [];
    const results = [];
    for (const postId of ids) {
      const r = await this.publishEnqueue.enqueueManual({
        contentType: 'POST',
        contentId: postId,
        force: body.force ?? true,
        triggeredByUserId: user?.id,
      });
      results.push({ postId, ...r });
    }
    return { ok: true, results };
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

  @Get('intro-videos/meta')
  introVideosMeta() {
    return {
      propertyTypes: Object.entries(SOCIAL_INTRO_PROPERTY_TYPE_LABELS).map(([id, label]) => ({
        id,
        label,
      })),
    };
  }

  @Get('intro-videos')
  listIntroVideos() {
    return this.introVideos.listAll();
  }

  @Post('intro-videos')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),
      limits: { fileSize: 120 * 1024 * 1024 },
    }),
  )
  async createIntroVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      title?: string;
      propertyType?: string;
      active?: string | boolean;
      priority?: string | number;
      thumbnailUrl?: string;
      durationSeconds?: string | number;
    },
  ) {
    const propertyType = (body.propertyType ?? '').trim().toUpperCase() as SocialIntroPropertyType;
    if (!Object.values(SocialIntroPropertyType).includes(propertyType)) {
      throw new BadRequestException('Neplatný typ nemovitosti pro úvodní video.');
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Video soubor je povinný.');
    }
    const videoUrl = await this.propertyMedia.uploadVideo(file);
    let durationSeconds =
      body.durationSeconds != null && body.durationSeconds !== ''
        ? Number(body.durationSeconds)
        : null;
    if (!Number.isFinite(durationSeconds)) {
      durationSeconds = await this.probeUploadedVideoDuration(file.buffer);
    }
    const row = await this.introVideos.create({
      title: (body.title ?? '').trim() || SOCIAL_INTRO_PROPERTY_TYPE_LABELS[propertyType],
      propertyType,
      videoUrl,
      thumbnailUrl: body.thumbnailUrl?.trim() || null,
      durationSeconds,
      active: body.active === false || body.active === 'false' ? false : true,
      priority: Number(body.priority) || 0,
    });
    return { ok: true, item: row };
  }

  @Patch('intro-videos/:id')
  updateIntroVideo(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      title: string;
      propertyType: SocialIntroPropertyType;
      active: boolean;
      priority: number;
      thumbnailUrl: string | null;
      durationSeconds: number | null;
    }>,
  ) {
    return this.introVideos.update(id, body).then((item) => ({ ok: true, item }));
  }

  @Post('intro-videos/:id/video')
  @UseInterceptors(
    FileInterceptor('video', {
      storage: memoryStorage(),
      limits: { fileSize: 120 * 1024 * 1024 },
    }),
  )
  async replaceIntroVideo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { durationSeconds?: string | number },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Video soubor je povinný.');
    }
    const videoUrl = await this.propertyMedia.uploadVideo(file);
    let durationSeconds =
      body.durationSeconds != null && body.durationSeconds !== ''
        ? Number(body.durationSeconds)
        : null;
    if (!Number.isFinite(durationSeconds)) {
      durationSeconds = await this.probeUploadedVideoDuration(file.buffer);
    }
    const item = await this.introVideos.update(id, { videoUrl, durationSeconds });
    return { ok: true, item };
  }

  @Delete('intro-videos/:id')
  async deleteIntroVideo(@Param('id') id: string) {
    await this.introVideos.delete(id);
    return { ok: true };
  }

  private async probeUploadedVideoDuration(buffer: Buffer): Promise<number | null> {
    const ffmpeg = resolveFfmpegBinary();
    if (!ffmpeg.path) return null;
    const tmp = join(tmpdir(), `intro-probe-${Date.now()}.mp4`);
    const { writeFile, rm } = await import('node:fs/promises');
    try {
      await writeFile(tmp, buffer);
      const { stderr } = await runFfmpegCapture(ffmpeg.path, ['-hide_banner', '-i', tmp]);
      return parseDurationSecondsFromFfmpegStderr(stderr);
    } finally {
      await rm(tmp, { force: true }).catch(() => undefined);
    }
  }
}
