import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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

    const [todayJobs, weekJobs, queueCount, publishedCount, failedCount, costToday, costMonth] =
      await Promise.all([
        this.prisma.aiInfluencerReelJob.count({
          where: { createdAt: { gte: dayStart } },
        }),
        this.prisma.aiInfluencerReelJob.count({
          where: { createdAt: { gte: weekStart } },
        }),
        this.prisma.aiInfluencerReelJob.count({
          where: {
            status: {
              in: [
                'EVALUATING',
                'CANDIDATE',
                'SCRIPT_GENERATING',
                'SCRIPT_READY',
                'VOICE_GENERATING',
                'VOICE_READY',
                'AVATAR_GENERATING',
                'AVATAR_READY',
                'RENDERING',
              ],
            },
          },
        }),
        this.prisma.aiInfluencerReelJob.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.aiInfluencerReelJob.count({ where: { status: 'FAILED' } }),
        this.prisma.aiInfluencerReelJob.aggregate({
          where: { createdAt: { gte: dayStart } },
          _sum: { totalExternalCost: true },
        }),
        this.prisma.aiInfluencerReelJob.aggregate({
          where: { createdAt: { gte: new Date(dayStart.getFullYear(), dayStart.getMonth(), 1) } },
          _sum: { totalExternalCost: true },
        }),
      ]);

    const providers = await this.getProviderStatus();

    return {
      settings: cfg,
      automation: {
        enabled: cfg.enabled,
        paused: cfg.automationPaused,
        pauseReason: cfg.automationPauseReason,
        nextCheckInMinutes: this.auto.getNextCheckInMinutes(),
        videosToday: todayJobs,
        maxVideosPerDay: cfg.maxPerDay,
        autoPublishFacebook: cfg.autoPublishFacebook,
        autoPublishInstagram: cfg.autoPublishInstagram,
        autoPublishYoutube: cfg.autoPublishYoutube,
        autoPublishPortal: cfg.autoPublishPortal,
      },
      stats: {
        reelsToday: todayJobs,
        reelsWeek: weekJobs,
        inQueue: queueCount,
        published: publishedCount,
        failed: failedCount,
        costTodayCzk: costToday._sum.totalExternalCost ?? 0,
        costMonthCzk: costMonth._sum.totalExternalCost ?? 0,
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

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post('jobs/from-article/:articleId')
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
    const text =
      body.text?.trim() ||
      'Dobrý den, jsem virtuální redaktorka XXREALIT. Přináším vám novinky ze světa realit a bydlení.';
    const profile = await this.registry.getDefaultProfile();
    const health = await this.elevenLabs.getHealth(profile.voiceId);

    if (!health.apiKeyConfigured) {
      throw new BadRequestException('ElevenLabs API key není nastaven (ELEVENLABS_API_KEY).');
    }
    if (health.status === 'INVALID_API_KEY') {
      throw new BadRequestException('ElevenLabs API key je neplatný.');
    }
    if (health.status === 'RATE_LIMITED') {
      throw new BadRequestException('ElevenLabs rate limit — zkuste později.');
    }
    if (health.status === 'QUOTA_EXCEEDED') {
      throw new BadRequestException('ElevenLabs quota vyčerpána.');
    }

    const voiceId = body.voiceId || profile.voiceId || this.elevenLabs.resolveVoiceId(null);
    if (!voiceId) {
      throw new BadRequestException('ElevenLabs je připojen. Nejprve vyberte hlas.');
    }

    const result = await this.elevenLabs.generateSpeech({
      text,
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
    };
  }

  @Post('test/avatar')
  async testAvatar(@Body() body: { text?: string; avatarId?: string }) {
    const profile = await this.registry.getDefaultProfile();
    const health = await this.heygen.getHealth(profile.avatarId);

    if (!health.apiKeyConfigured) {
      throw new BadRequestException('HEYGEN_API_KEY není nakonfigurován.');
    }
    if (health.status === 'INVALID_API_KEY') {
      throw new BadRequestException('HeyGen API key je neplatný.');
    }
    if (health.status === 'PERMISSION_REQUIRED') {
      throw new BadRequestException('HeyGen API key nemá potřebná oprávnění.');
    }
    if (health.status === 'RATE_LIMITED') {
      throw new BadRequestException('HeyGen rate limit — zkuste později.');
    }
    if (health.status !== 'CONNECTED') {
      throw new BadRequestException(health.lastError || 'HeyGen API není dostupné.');
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

  private async getProviderStatus() {
    const profile = await this.registry.getDefaultProfile();
    const [aiDiag, elevenHealth, heygenHealth, did, yt, fb, ig] = await Promise.all([
      this.openAi.getStatus(),
      this.elevenLabs.getHealth(profile.voiceId),
      this.heygen.getHealth(profile.avatarId),
      this.did.testConnection(),
      this.youtubeOAuth.getConnectionStatus(),
      this.publish.testFacebookConnection(),
      this.publish.getInstagramConnectionStatus(),
    ]);

    const aiConnected = aiDiag.connected === true;
    const elevenConnected = elevenHealth.status === 'CONNECTED';
    const elevenVoiceSelected = elevenHealth.voiceStatus === 'SELECTED';
    const heygenConnected = heygenHealth.status === 'CONNECTED';
    const heygenAvatarSelected = heygenHealth.avatarStatus === 'SELECTED';

    const productionReady =
      aiConnected &&
      elevenConnected &&
      elevenVoiceSelected &&
      heygenConnected &&
      heygenAvatarSelected;

    const readyReasons: string[] = [];
    if (!aiConnected) readyReasons.push('AI provider není připojen');
    if (!elevenConnected) readyReasons.push('ElevenLabs není připojen');
    if (!elevenVoiceSelected) readyReasons.push('Chybí ElevenLabs hlas');
    if (!heygenConnected) readyReasons.push('HeyGen není připojen');
    if (!heygenAvatarSelected) readyReasons.push('Chybí HeyGen avatar');

    const publishReasons: string[] = [];
    if (!fb.ok) publishReasons.push('Facebook není připojen');
    if (!ig.connected || !ig.scopesOk) publishReasons.push('Instagram není připraven');
    if (!yt.connected) publishReasons.push('YouTube není připojen');

    const igTest = this.publish.formatInstagramTestResult(ig);
    const igPublishReady = igTest.status === 'READY';

    return {
      ready: {
        ready: productionReady,
        reason: productionReady ? null : readyReasons[0] ?? 'Není připraveno',
        reasons: readyReasons,
        productionReady,
        publishReady: fb.ok && igPublishReady && yt.autoPublishReady,
        publishReasons,
      },
      ai: {
        configured: aiDiag.configured,
        connected: aiDiag.connected,
      },
      elevenLabs: {
        configured: elevenHealth.apiKeyConfigured,
        connected: elevenConnected,
        status: elevenHealth.status,
        voiceStatus: elevenHealth.voiceStatus,
        voicesPermission: elevenHealth.voicesPermission,
        ttsPermission: elevenHealth.ttsPermission,
        voiceId: elevenHealth.voiceId,
        latencyMs: elevenHealth.latencyMs ?? null,
        lastError: elevenHealth.lastError ?? null,
        httpStatus: elevenHealth.httpStatus ?? null,
        detailStatus: elevenHealth.detailStatus ?? null,
        detailMessage: elevenHealth.detailMessage ?? null,
      },
      heygen: {
        configured: heygenHealth.apiKeyConfigured,
        connected: heygenConnected,
        status: heygenHealth.status,
        avatarStatus: heygenHealth.avatarStatus,
        avatarsPermission: heygenHealth.avatarsPermission,
        heygenApiKeyPresent: heygenHealth.heygenApiKeyPresent,
        avatarId: heygenHealth.avatarId,
        latencyMs: heygenHealth.latencyMs ?? null,
        lastError: heygenHealth.lastError ?? null,
        httpStatus: heygenHealth.httpStatus ?? null,
        errorCode: heygenHealth.errorCode ?? null,
        detailMessage: heygenHealth.detailMessage ?? null,
      },
      renderer: {
        configured: true,
        connected: true,
        preset: profile.renderPreset ?? DEFAULT_RENDER_SETTINGS.preset,
      },
      cloudinary: {
        configured: true,
        connected: true,
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
    };
  }
}
