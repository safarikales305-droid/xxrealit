import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OpenAiService } from '../openai/openai.service';
import { YouTubeOAuthService } from '../social/youtube/youtube-oauth.service';
import { YouTubePublishService } from '../social/youtube/youtube-publish.service';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { ShortsMusicService } from '../shorts-music/shorts-music.service';
import { AiInfluencerPublishService } from './ai-influencer-publish.service';
import { DEFAULT_RENDER_SETTINGS, mergeRenderSettings } from './ai-influencer-render.types';
import { AiInfluencerJobService } from './ai-influencer-job.service';
import { AiInfluencerAutoService } from './ai-influencer-auto.service';
import { AiInfluencerProviderRegistry } from './ai-influencer-provider.registry';
import { AiInfluencerSettingsService } from './ai-influencer-settings.service';
import { DIdAvatarProvider } from './providers/did-avatar.provider';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import { HeyGenVideoAgentProvider } from './providers/heygen-video-agent.provider';
import { HeyGenVideoAgentTestService } from './heygen-video-agent-test.service';
import { computeProductionReadiness } from './ai-influencer-preflight.util';
import { buildWorkerRuntimeDiagnostics } from './ai-influencer-runtime-config.util';
import {
  activeJobWhere,
  galleryVideoWhere,
  GALLERY_VIDEO_STATUSES,
} from './ai-influencer-job-status.util';
import {
  BRAND_PRONUNCIATION_TEST_SENTENCE,
  prepareSpeechTextForProvider,
} from './ai-influencer-pronunciation.util';
import { storyboardPreviewRows } from './ai-influencer-storyboard.util';
import type { ReelScenePlan } from './ai-influencer.types';

@Controller('admin/ai-influencer')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AiInfluencerAdminController {
  constructor(
    private readonly jobs: AiInfluencerJobService,
    private readonly settings: AiInfluencerSettingsService,
    private readonly registry: AiInfluencerProviderRegistry,
    private readonly openAi: OpenAiService,
    private readonly elevenLabs: ElevenLabsVoiceProvider,
    private readonly heygen: HeyGenAvatarProvider,
    private readonly videoAgent: HeyGenVideoAgentProvider,
    private readonly videoAgentTest: HeyGenVideoAgentTestService,
    private readonly did: DIdAvatarProvider,
    private readonly prisma: PrismaService,
    private readonly youtubeOAuth: YouTubeOAuthService,
    private readonly youtubePublish: YouTubePublishService,
    private readonly cloudinary: PropertyMediaCloudinaryService,
    private readonly publish: AiInfluencerPublishService,
    private readonly shortsMusic: ShortsMusicService,
    private readonly auto: AiInfluencerAutoService,
  ) {}

  @Get('dashboard')
  async getDashboard() {
    const cfg = await this.settings.getSettings();
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const [jobsStartedToday, jobsCompletedToday, activeCount, publishedCount, failedToday, costToday, costMonth, galleryVideos] =
      await Promise.all([
        this.prisma.aiInfluencerReelJob.count({
          where: { createdAt: { gte: dayStart } },
        }),
        this.prisma.aiInfluencerReelJob.count({
          where: {
            status: { in: GALLERY_VIDEO_STATUSES },
            OR: [
              { renderedAt: { gte: dayStart } },
              {
                AND: [
                  { renderedAt: null },
                  { updatedAt: { gte: dayStart } },
                ],
              },
            ],
            NOT: {
              AND: [
                { finalMasterUrl: null },
                { baseMasterUrl: null },
                { videoUrl: null },
                { avatarStorageUrl: null },
              ],
            },
          },
        }),
        this.prisma.aiInfluencerReelJob.count({ where: activeJobWhere() }),
        this.prisma.aiInfluencerReelJob.count({
          where: {
            OR: [
              { status: 'PUBLISHED' },
              { status: 'PARTIALLY_PUBLISHED' },
              { facebookPublishStatus: 'PUBLISHED' },
              { instagramPublishStatus: 'PUBLISHED' },
              { youtubePublishStatus: 'PUBLISHED' },
            ],
          },
        }),
        this.prisma.aiInfluencerReelJob.count({
          where: { status: 'FAILED', updatedAt: { gte: dayStart } },
        }),
        this.prisma.aiInfluencerReelJob.aggregate({
          where: { createdAt: { gte: dayStart } },
          _sum: { totalExternalCost: true },
        }),
        this.prisma.aiInfluencerReelJob.aggregate({
          where: { createdAt: { gte: new Date(dayStart.getFullYear(), dayStart.getMonth(), 1) } },
          _sum: { totalExternalCost: true },
        }),
        this.prisma.aiInfluencerReelJob.count({ where: galleryVideoWhere() }),
      ]);

    const providers = await this.getProviderStatus();

    return {
      settings: cfg,
      automation: {
        enabled: cfg.enabled,
        paused: cfg.automationPaused,
        pauseReason: cfg.automationPauseReason,
        nextCheckInMinutes: this.auto.getNextCheckInMinutes(),
        videosToday: jobsStartedToday,
        maxVideosPerDay: cfg.maxPerDay,
        autoPublishFacebook: cfg.autoPublishFacebook,
        autoPublishInstagram: cfg.autoPublishInstagram,
        autoPublishYoutube: cfg.autoPublishYoutube,
        autoPublishPortal: cfg.autoPublishPortal,
      },
      stats: {
        reelsToday: jobsStartedToday,
        jobsStartedToday,
        jobsCompletedToday,
        reelsWeek: await this.prisma.aiInfluencerReelJob.count({
          where: { createdAt: { gte: weekStart } },
        }),
        inQueue: activeCount,
        published: publishedCount,
        failed: failedToday,
        failedAllTime: await this.prisma.aiInfluencerReelJob.count({ where: { status: 'FAILED' } }),
        costTodayCzk: costToday._sum.totalExternalCost ?? 0,
        costMonthCzk: costMonth._sum.totalExternalCost ?? 0,
      },
      debugCounts: {
        jobsToday: jobsStartedToday,
        activeJobs: activeCount,
        completedVideosToday: jobsCompletedToday,
        publishedJobsToday: await this.prisma.aiInfluencerReelJob.count({
          where: {
            status: { in: ['PUBLISHED', 'PARTIALLY_PUBLISHED'] },
            updatedAt: { gte: dayStart },
          },
        }),
        failedJobsToday: failedToday,
        galleryVideos,
      },
      providers,
    };
  }

  @Get('settings')
  getSettings() {
    return this.settings.getSettings();
  }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.updateSettings(body as never);
  }

  @Get('articles')
  listArticles() {
    return this.jobs.listArticles();
  }

  @Get('jobs')
  listJobs() {
    return this.jobs.listJobs();
  }

  @Get('jobs/active')
  listActiveJobs() {
    return this.jobs.listActiveJobs();
  }

  @Get('videos')
  listVideos(@Query('limit') limit?: string) {
    const parsed = limit ? Number.parseInt(limit, 10) : 60;
    return this.jobs.listVideos(Number.isFinite(parsed) ? parsed : 60);
  }

  @Delete('jobs/bulk/failed')
  deleteFailedJobs() {
    return this.jobs.deleteFailedJobs();
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post('jobs/from-article/:articleId')
  @HttpCode(HttpStatus.ACCEPTED)
  createFromArticle(
    @Param('articleId') articleId: string,
    @Body() body?: { force?: boolean },
  ) {
    return this.jobs.createJobFromArticle(articleId, { force: body?.force === true });
  }

  @Post('jobs/:id/force-start')
  forceStart(@Param('id') id: string) {
    return this.jobs.forceStartJob(id);
  }

  @Post('jobs/:id/skip')
  skipJob(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.jobs.skipJob(id, body?.reason);
  }

  @Post('jobs/:id/cancel')
  cancelJob(@Param('id') id: string, @Body() body?: { reason?: string }) {
    return this.jobs.cancelJob(id, body?.reason);
  }

  @Delete('jobs/:id')
  deleteJob(@Param('id') id: string, @Query('historyOnly') historyOnly?: string) {
    return this.jobs.deleteJob(id, { historyOnly: historyOnly === '1' || historyOnly === 'true' });
  }

  @Post('automation/resume')
  resumeAutomation() {
    return this.settings.updateSettings({
      automationPaused: false,
      automationPauseReason: null,
    });
  }

  @Post('jobs/:id/approve-script')
  approveScript(@Param('id') id: string) {
    return this.jobs.approveScript(id);
  }

  @Post('jobs/:id/retry')
  retryJob(@Param('id') id: string) {
    return this.jobs.retryJob(id);
  }

  @Post('jobs/:id/accept-unbranded')
  acceptUnbranded(@Param('id') id: string) {
    return this.jobs.acceptUnbrandedMaster(id);
  }

  @Post('jobs/:id/regenerate')
  regenerateJob(@Param('id') id: string) {
    return this.jobs.regenerateRender(id);
  }

  @Post('jobs/:id/publish/facebook')
  publishFacebook(@Param('id') id: string) {
    return this.jobs.publishToFacebook(id);
  }

  @Post('jobs/:id/publish/youtube')
  publishYoutube(@Param('id') id: string) {
    return this.jobs.publishToYoutube(id);
  }

  @Post('jobs/:id/publish/instagram')
  publishInstagram(@Param('id') id: string) {
    return this.jobs.publishToInstagram(id);
  }

  @Post('jobs/:id/publish/portal')
  publishPortal(@Param('id') id: string) {
    return this.jobs.publishToPortal(id);
  }

  @Get('jobs/:id/storyboard')
  async jobStoryboard(@Param('id') id: string) {
    const job = await this.jobs.getJob(id);
    const scenes = (job.scenesJson as ReelScenePlan[] | null) ?? [];
    return {
      hook: job.selectedHook ?? job.captionTitle,
      cta: job.captionDescription,
      scenes: storyboardPreviewRows(scenes),
      videoFormat: 'VERTICAL_SHORT_9_16',
      output: { width: 1080, height: 1920, aspectRatio: '9:16' },
    };
  }

  @Get('instagram/status')
  instagramStatus() {
    return this.publish.getInstagramConnectionStatus();
  }

  @Post('instagram/verify')
  async verifyInstagram() {
    const status = await this.publish.verifyInstagramConnection();
    return {
      ...status,
      test: this.publish.formatInstagramTestResult(status),
    };
  }

  @Post('test/instagram')
  testInstagram() {
    return this.publish.testInstagramConnection();
  }

  @Get('music')
  listMusic() {
    return this.shortsMusic.listActiveForPicker();
  }

  @Get('render-settings')
  async getRenderSettings() {
    const profile = await this.registry.getDefaultProfile();
    return {
      preset: profile.renderPreset ?? 'modern_xxrealit',
      settings: mergeRenderSettings(profile.renderSettingsJson as object),
    };
  }

  @Patch('render-settings')
  async updateRenderSettings(@Body() body: Record<string, unknown>) {
    const profile = await this.registry.getDefaultProfile();
    const settings = mergeRenderSettings(body.settings as object);
    return this.prisma.aiInfluencerProfile.update({
      where: { id: profile.id },
      data: {
        renderPreset: typeof body.preset === 'string' ? body.preset : profile.renderPreset,
        renderSettingsJson: settings as object,
      },
    });
  }

  @Post('test/facebook')
  testFacebook() {
    return this.publish.testFacebookConnection();
  }

  @Get('youtube/status')
  youtubeStatus() {
    return this.youtubeOAuth.getConnectionStatus();
  }

  @Post('youtube/disconnect')
  youtubeDisconnect() {
    return this.youtubeOAuth.disconnect();
  }

  @Post('test/youtube')
  testYoutube() {
    return this.youtubeOAuth.testConnection();
  }

  @Post('test/youtube/upload')
  async testYoutubeUpload(@Body() body: { jobId?: string; videoUrl?: string }) {
    let videoUrl = body.videoUrl?.trim();
    if (!videoUrl && body.jobId?.trim()) {
      const job = await this.prisma.aiInfluencerReelJob.findUnique({
        where: { id: body.jobId.trim() },
        select: { finalMasterUrl: true, baseMasterUrl: true },
      });
      videoUrl = job?.finalMasterUrl ?? job?.baseMasterUrl ?? undefined;
    }
    if (!videoUrl) {
      const latest = await this.prisma.aiInfluencerReelJob.findFirst({
        where: { finalMasterUrl: { not: null } },
        orderBy: { updatedAt: 'desc' },
        select: { finalMasterUrl: true },
      });
      videoUrl = latest?.finalMasterUrl ?? undefined;
    }
    if (!videoUrl) {
      throw new BadRequestException('Chybí final master video pro testovací upload.');
    }

    const health = await this.youtubeOAuth.testConnection();
    if (health.status !== 'CONNECTED') {
      return {
        ok: false,
        youtubeUploadStatus: health.status,
        message: health.message ?? 'YouTube není připraveno k uploadu.',
      };
    }

    const upload = await this.youtubePublish.uploadVideo({
      videoUrl,
      title: 'XXREALIT – test YouTube integrace',
      description: 'Soukromý testovací upload z XXREALIT adminu.',
      tags: ['xxrealit', 'test'],
      privacyStatus: 'private',
    });

    return {
      ok: true,
      youtubeVideoId: upload.videoId,
      youtubeUrl: upload.url,
      youtubeUploadStatus: 'PRIVATE_UPLOADED',
    };
  }

  @Get('health/elevenlabs')
  async getElevenLabsHealth() {
    const profile = await this.registry.getDefaultProfile();
    return this.elevenLabs.getHealth(profile.voiceId);
  }

  @Get('health/heygen')
  async getHeyGenHealth() {
    const profile = await this.registry.getDefaultProfile();
    return this.heygen.getHealth(profile.avatarId);
  }

  @Get('health/video-agent')
  async getVideoAgentHealth() {
    const readiness = await this.videoAgent.getReadiness();
    const profile = await this.registry.getDefaultProfile();
    const avatarReady = this.heygen.isAvatarSelected(profile.avatarId);
    return {
      ...readiness,
      avatarReady,
      fallbackReady: avatarReady && this.heygen.isApiKeyConfigured(),
    };
  }

  @Get('voices/elevenlabs')
  async listElevenLabsVoices() {
    return this.elevenLabs.listVoicesWithPermission();
  }

  @Get('avatars/heygen')
  async listHeyGenAvatars() {
    return this.heygen.listAvatarsWithPermission();
  }

  @Post('test/voice')
  async testVoice(@Body() body: { text?: string; voiceId?: string }) {
    const settings = await this.settings.getSettings();
    const text =
      body.text?.trim() ||
      'Dobrý den, jsem virtuální redaktorka XXREALIT. Přináším vám novinky ze světa realit a bydlení.';
    const profile = await this.registry.getDefaultProfile();
    await this.elevenLabs.assertReadyForGeneration(body.voiceId || profile.voiceId);

    const voiceId = body.voiceId || profile.voiceId || this.elevenLabs.resolveVoiceId(null);
    if (!voiceId) {
      throw new BadRequestException('ElevenLabs je připojen. Nejprve vyberte hlas.');
    }

    const prepared = prepareSpeechTextForProvider(text, 'ELEVENLABS', settings);
    const result = await this.elevenLabs.generateSpeech({
      text: prepared.speechText,
      voiceId,
      language: profile.language,
      speed: profile.voiceSpeed ?? undefined,
      stability: profile.voiceStability ?? undefined,
      style: profile.voiceStyle ?? undefined,
    });
    const upload = await this.cloudinary.uploadShortsMusicBuffer(
      result.audioBuffer,
      'ai-influencer-voice-test.mp3',
      result.mimeType,
    );
    return {
      ok: true,
      previewUrl: upload.url,
      durationSec: result.durationSec,
      costEstimatedCzk: result.costEstimatedCzk,
      pronunciationRulesApplied: prepared.rulesApplied,
    };
  }

  @Post('test/pronunciation')
  async testPronunciation(@Body() body: { text?: string; voiceId?: string }) {
    const settings = await this.settings.getSettings();
    const profile = await this.registry.getDefaultProfile();
    await this.elevenLabs.assertReadyForGeneration(body.voiceId || profile.voiceId);
    const voiceId = body.voiceId || profile.voiceId || this.elevenLabs.resolveVoiceId(null);
    if (!voiceId) {
      throw new BadRequestException('ElevenLabs je připojen. Nejprve vyberte hlas.');
    }
    const displayText = body.text?.trim() || BRAND_PRONUNCIATION_TEST_SENTENCE;
    const prepared = prepareSpeechTextForProvider(displayText, 'ELEVENLABS', settings);
    const result = await this.elevenLabs.generateSpeech({
      text: prepared.speechText,
      voiceId,
      language: profile.language,
      speed: profile.voiceSpeed ?? undefined,
      stability: profile.voiceStability ?? undefined,
      style: profile.voiceStyle ?? undefined,
    });
    const upload = await this.cloudinary.uploadShortsMusicBuffer(
      result.audioBuffer,
      'ai-influencer-pronunciation-test.mp3',
      result.mimeType,
    );
    return {
      ok: true,
      displayText,
      speechText: prepared.speechText,
      previewUrl: upload.url,
      durationSec: result.durationSec,
      pronunciationRulesApplied: prepared.rulesApplied,
    };
  }

  @Post('test/avatar')
  async testAvatar(@Body() body: { text?: string; avatarId?: string }) {
    const profile = await this.registry.getDefaultProfile();
    const health = await this.heygen.getGenerationReadiness(profile.avatarId);

    if (!health.ready) {
      throw new BadRequestException(health.message ?? 'HeyGen není připraven.');
    }

    const avatarId =
      body.avatarId?.trim() ||
      profile.avatarId?.trim() ||
      this.heygen.resolveAvatarId(null);
    if (!avatarId) {
      throw new BadRequestException('HeyGen je připojen, ale není vybrán avatar.');
    }

    const verify = await this.heygen.verifyAvatar(avatarId);
    if (!verify.ok) {
      throw new BadRequestException(verify.message);
    }

    return {
      ok: true,
      avatarId,
      verified: verify.verified,
      message: verify.message,
    };
  }

  @Post('test/video-agent')
  @HttpCode(HttpStatus.ACCEPTED)
  async testVideoAgent() {
    try {
      const job = await this.videoAgentTest.createTestJob();
      return {
        jobId: job.id,
        status: job.status,
        progressPercent: job.progressPercent,
        progressLabel: job.progressLabel,
      };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : 'HEYGEN_VIDEO_AGENT_TEST_FAILED';
      const message = err instanceof Error ? err.message : 'Video Agent test selhal.';
      throw new BadRequestException({ message, code });
    }
  }

  @Get('test/video-agent/active')
  getActiveVideoAgentTest() {
    const job = this.videoAgentTest.getActiveJob();
    return { job };
  }

  @Get('test/video-agent/:jobId/status')
  getVideoAgentTestStatus(@Param('jobId') jobId: string) {
    return { job: this.videoAgentTest.getJob(jobId) };
  }

  @Post('test/fallback')
  async testFallback(@Body() body: { text?: string; avatarId?: string }) {
    return this.testAvatar(body);
  }

  @Get('profile')
  async getProfile() {
    return this.registry.getDefaultProfile();
  }

  @Patch('profile')
  async updateProfile(@Body() body: Record<string, unknown>) {
    const profile = await this.registry.getDefaultProfile();
    return this.prisma.aiInfluencerProfile.update({
      where: { id: profile.id },
      data: {
        name: typeof body.name === 'string' ? body.name : undefined,
        avatarProvider:
          body.avatarProvider === 'HEYGEN' || body.avatarProvider === 'DID'
            ? body.avatarProvider
            : undefined,
        avatarId: typeof body.avatarId === 'string' ? body.avatarId : undefined,
        voiceId: typeof body.voiceId === 'string' ? body.voiceId : undefined,
        voiceSpeed: typeof body.voiceSpeed === 'number' ? body.voiceSpeed : undefined,
        voiceStability: typeof body.voiceStability === 'number' ? body.voiceStability : undefined,
        voiceStyle: typeof body.voiceStyle === 'number' ? body.voiceStyle : undefined,
        personalityPrompt:
          typeof body.personalityPrompt === 'string' ? body.personalityPrompt : undefined,
        renderPreset: typeof body.renderPreset === 'string' ? body.renderPreset : undefined,
        renderSettingsJson:
          body.renderSettingsJson && typeof body.renderSettingsJson === 'object'
            ? (body.renderSettingsJson as object)
            : undefined,
      },
    });
  }

  private maskId(id: string | null | undefined): string | null {
    if (!id) return null;
    if (id.length <= 6) return '****';
    return `****${id.slice(-4)}`;
  }

  private resolveVideoAgentUiStatus(
    readiness: Awaited<ReturnType<HeyGenVideoAgentProvider['getReadiness']>>,
    testOutcome: ReturnType<HeyGenVideoAgentTestService['getLastTestOutcome']>,
  ): 'READY' | 'NOT AVAILABLE' | 'AUTH ERROR' {
    if (readiness.apiKeyPresence === 'MISSING') return 'NOT AVAILABLE';
    if (readiness.probeStatus === 401 || readiness.probeStatus === 403) return 'AUTH ERROR';
    if (
      testOutcome.lastErrorCode === 'HEYGEN_VIDEO_AGENT_AUTH_FAILED' ||
      testOutcome.lastErrorCode === 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE'
    ) {
      return testOutcome.lastErrorCode === 'HEYGEN_VIDEO_AGENT_AUTH_FAILED' ? 'AUTH ERROR' : 'NOT AVAILABLE';
    }
    if (!readiness.available) return 'NOT AVAILABLE';
    return 'READY';
  }

  private async getProviderStatus() {
    const profile = await this.registry.getDefaultProfile();
    const [aiDiag, elevenHealth, elevenReadiness, heygenReadiness, videoAgentReadiness, did, yt, fb, ig] = await Promise.all([
      this.openAi.getStatus(),
      this.elevenLabs.getHealth(profile.voiceId),
      this.elevenLabs.getGenerationReadiness(profile.voiceId),
      this.heygen.getGenerationReadiness(profile.avatarId),
      this.videoAgent.getReadiness(),
      this.did.testConnection(),
      this.youtubeOAuth.getConnectionStatus(),
      this.publish.testFacebookConnection(),
      this.publish.getInstagramConnectionStatus(),
    ]);
    const heygenHealth = await this.heygen.getHealth(profile.avatarId);
    const storageDiag = this.cloudinary.getDiagnostics();
    const cfg = await this.settings.getSettings();

    const aiConnected = aiDiag.connected === true;
    const elevenConnected = elevenHealth.status === 'CONNECTED';
    const elevenVoiceSelected = elevenReadiness.voiceSelected;
    const elevenTtsReady =
      elevenHealth.ttsPermission === 'PASS' || elevenConnected || elevenReadiness.ready;
    const heygenGenerationReady = heygenReadiness.ready;
    const heygenConnected = heygenReadiness.status === 'CONNECTED' && heygenReadiness.apiKeyPresence === 'CONFIGURED';
    const heygenAvatarSelected = heygenReadiness.avatarSelected;

    const production = computeProductionReadiness({
      settings: cfg,
      storageConfigured: storageDiag.configured,
      heygenReady: heygenGenerationReady,
      videoAgentAvailable: videoAgentReadiness.available,
      elevenReady: elevenReadiness.ready,
      elevenTtsReady:
        elevenHealth.ttsPermission === 'PASS' || elevenConnected || elevenReadiness.ready,
    });

    const productionReady = production.ready;
    const readyReasons = production.reasons;

    const publishReasons: string[] = [];
    if (!fb.ok) publishReasons.push('Facebook není připojen');
    if (!ig.connected || !ig.scopesOk) publishReasons.push('Instagram není připraven');
    if (!yt.connected) publishReasons.push('YouTube není připojen');

    const igTest = this.publish.formatInstagramTestResult(ig);
    const igPublishReady = igTest.status === 'READY';
    const testOutcome = this.videoAgentTest.getLastTestOutcome();
    const videoAgentUiStatus = this.resolveVideoAgentUiStatus(videoAgentReadiness, testOutcome);

    const workerRuntime = buildWorkerRuntimeDiagnostics({
      generationMode: production.mode,
      elevenRequired: production.elevenRequired,
      storageConfigured: storageDiag.configured,
    });

    return {
      ready: {
        ready: productionReady,
        reason: productionReady ? null : readyReasons[0] ?? 'Není připraveno',
        reasons: readyReasons,
        productionReady,
        productionMode: production.mode,
        elevenRequired: production.elevenRequired,
        aiRequiredForNewScripts: production.aiRequiredForNewScripts,
        publishReady: fb.ok && igPublishReady && yt.autoPublishReady,
        publishReasons,
      },
      ai: {
        configured: aiDiag.configured,
        connected: aiConnected,
        ready: aiConnected,
        disabled: !aiConnected,
      },
      elevenLabs: {
        configured: elevenHealth.apiKeyConfigured,
        connected: elevenConnected,
        status: elevenHealth.status,
        apiKeyPresence: elevenReadiness.apiKeyPresence,
        voiceIdPresence: elevenVoiceSelected ? 'CONFIGURED' : 'MISSING',
        voiceStatus: elevenHealth.voiceStatus,
        voicesPermission: elevenHealth.voicesPermission,
        voicesReadStatus:
          elevenHealth.voicesPermission === 'PASS'
            ? 'OPTIONAL / READY'
            : elevenHealth.voicesPermission === 'PERMISSION_REQUIRED'
              ? 'OPTIONAL / MISSING'
              : elevenHealth.voicesPermission === 'NOT_CHECKED'
                ? 'OPTIONAL / NOT CHECKED'
                : 'OPTIONAL / FAIL',
        ttsPermission: elevenHealth.ttsPermission,
        ttsReady: elevenTtsReady,
        voiceId: elevenHealth.voiceId,
        latencyMs: elevenHealth.latencyMs ?? null,
        lastError: elevenHealth.lastError ?? null,
        httpStatus: elevenHealth.httpStatus ?? null,
        detailStatus: elevenHealth.detailStatus ?? null,
        detailMessage: elevenHealth.detailMessage ?? null,
      },
      heygen: {
        configured: heygenReadiness.apiKeyPresence === 'CONFIGURED',
        connected: heygenGenerationReady,
        generationReady: heygenGenerationReady,
        status: heygenReadiness.status,
        avatarStatus: heygenReadiness.avatarSelected ? 'SELECTED' : 'NOT_SELECTED',
        avatarsPermission: heygenHealth.avatarsPermission,
        heygenApiKeyPresent: heygenReadiness.apiKeyPresence === 'CONFIGURED',
        apiKeyPresence: heygenReadiness.apiKeyPresence,
        avatarId: heygenHealth.avatarId,
        latencyMs: heygenHealth.latencyMs ?? null,
        lastError: heygenReadiness.message ?? heygenHealth.lastError ?? null,
        httpStatus: heygenHealth.httpStatus ?? null,
        errorCode: heygenHealth.errorCode ?? null,
        detailMessage: heygenReadiness.message ?? heygenHealth.detailMessage ?? null,
        videoAgentStatus: videoAgentUiStatus,
        videoAgentMessage: videoAgentReadiness.message,
      },
      videoEngine: {
        mode: cfg.videoGenerationMode === 'AVATAR' ? 'Jednoduchý avatar' : 'Dynamické AI video',
        videoGenerationMode: cfg.videoGenerationMode,
        allowFallback: cfg.allowVideoAgentFallback,
        videoStyle: cfg.videoStyle,
        avatarFrequency: cfg.avatarFrequency,
        format: '1080x1920 · 9:16',
        heygenVideoAgent: videoAgentUiStatus,
        heygenVideoAgentMessage: videoAgentReadiness.message,
        fallback: heygenGenerationReady ? 'READY' : 'NOT READY',
        selectedAvatarId: heygenHealth.avatarId,
      },
      renderer: {
        configured: true,
        connected: true,
        preset: profile.renderPreset ?? DEFAULT_RENDER_SETTINGS.preset,
      },
      storage: {
        configured: storageDiag.configured,
        connected: storageDiag.configured,
        source: storageDiag.source,
        message: storageDiag.message,
        cloudNamePresent: storageDiag.cloudNamePresent,
        apiKeyPresent: storageDiag.apiKeyPresent,
        apiSecretPresent: storageDiag.apiSecretPresent,
      },
      cloudinary: {
        configured: storageDiag.configured,
        connected: storageDiag.configured,
        message: storageDiag.message,
      },
      did: {
        configured: this.did.isConfigured(),
        connected: did.ok,
        lastError: did.error ?? null,
      },
      facebook: {
        configured: true,
        connected: fb.ok,
        pageId: this.maskId(fb.pageId),
        pageName: fb.pageName ?? null,
        tokenActive: fb.ok,
        lastError: fb.error ?? null,
      },
      youtube: {
        configured: yt.configured,
        connected: yt.connected,
        healthStatus: yt.healthStatus,
        channelId: yt.channelId,
        channelTitle: yt.channelTitle ?? null,
        uploadScopeOk: yt.uploadScopeOk,
        refreshTokenOk: yt.refreshTokenOk,
        autoPublishReady: yt.autoPublishReady,
        missingEnv: yt.missingEnv,
        redirectUri: yt.redirectUri,
      },
      instagram: {
        connected: ig.connected,
        instagramBusinessId: this.maskId(ig.instagramBusinessId),
        instagramUsername: ig.instagramUsername,
        linkedPageName: ig.linkedPageName,
        tokenActive: ig.tokenActive,
        scopesOk: ig.scopesOk,
        missingScopes: ig.missingScopes,
        needsReconnect: ig.needsReconnect,
        publishReady: igPublishReady,
        message: ig.message,
        testStatus: igTest.status,
      },
      shorts: {
        configured: storageDiag.configured,
        connected: storageDiag.configured,
        message: storageDiag.configured
          ? null
          : 'Missing permanent public media storage (Cloudinary)',
      },
      workerRuntime: {
        ...workerRuntime,
        aiProvider: aiConnected ? 'READY' : 'NOT READY',
        heygenVideoAgent: videoAgentUiStatus,
        elevenLabsRequired: production.elevenRequired,
        elevenLabsStatus: workerRuntime.elevenRequired
          ? workerRuntime.elevenLabsApiKey === 'CONFIGURED'
            ? 'READY'
            : 'MISSING'
          : 'NOT_REQUIRED',
        avatarFallback: heygenGenerationReady ? 'READY' : 'NOT READY',
        providerElevenLabsApiKey: elevenReadiness.apiKeyPresence,
        providerHeygenApiKey: heygenReadiness.apiKeyPresence,
      },
    };
  }
}
