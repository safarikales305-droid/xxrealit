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
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { AiInfluencerJobService } from './ai-influencer-job.service';
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
    private readonly cloudinary: PropertyMediaCloudinaryService,
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

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.jobs.getJob(id);
  }

  @Post('jobs/from-article/:articleId')
  createFromArticle(@Param('articleId') articleId: string) {
    return this.jobs.createJobFromArticle(articleId);
  }

  @Post('jobs/:id/approve-script')
  approveScript(@Param('id') id: string) {
    return this.jobs.approveScript(id);
  }

  @Post('jobs/:id/retry')
  retryJob(@Param('id') id: string) {
    return this.jobs.retryJob(id);
  }

  @Get('health/elevenlabs')
  async getElevenLabsHealth() {
    const profile = await this.registry.getDefaultProfile();
    return this.elevenLabs.getHealth(profile.voiceId);
  }

  @Get('voices/elevenlabs')
  async listElevenLabsVoices() {
    const health = await this.elevenLabs.getHealth();
    if (health.status === 'NOT_CONFIGURED') {
      throw new BadRequestException('ElevenLabs API key není nastaven.');
    }
    if (health.status === 'INVALID_API_KEY') {
      throw new BadRequestException('ElevenLabs API key je neplatný.');
    }
    if (health.status !== 'CONNECTED') {
      throw new BadRequestException(health.lastError || 'ElevenLabs není dostupný.');
    }
    return this.elevenLabs.listVoices();
  }

  @Post('test/voice')
  async testVoice(@Body() body: { text?: string; voiceId?: string }) {
    const text = body.text?.trim() || 'Vítejte u realitních novinek XXREALIT.';
    const profile = await this.registry.getDefaultProfile();
    const health = await this.elevenLabs.getHealth(profile.voiceId);

    if (health.status === 'NOT_CONFIGURED') {
      throw new BadRequestException('ElevenLabs API key není nastaven (ELEVENLABS_API_KEY).');
    }
    if (health.status === 'INVALID_API_KEY') {
      throw new BadRequestException('ElevenLabs API key je neplatný.');
    }
    if (health.status === 'CONNECTION_ERROR') {
      throw new BadRequestException(health.lastError || 'ElevenLabs není dostupný.');
    }

    const voiceId = body.voiceId || profile.voiceId || this.elevenLabs.resolveVoiceId(null);
    if (!voiceId) {
      throw new BadRequestException('ElevenLabs je připojen. Nejprve vyberte hlas.');
    }

    const result = await this.elevenLabs.generateSpeech({
      text,
      voiceId: body.voiceId || profile.voiceId || undefined,
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
    const text = body.text?.trim() || 'Vítejte u realitních novinek XXREALIT.';
    const profile = await this.registry.getDefaultProfile();
    const started = await this.heygen.startGeneration({
      text,
      avatarId: body.avatarId || profile.avatarId || undefined,
    });
    return {
      ok: true,
      externalJobId: started.externalJobId,
      message: 'Avatar job spuštěn — sledujte stav přes worker polling.',
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
      },
    });
  }

  private async getProviderStatus() {
    const profile = await this.registry.getDefaultProfile();
    const [aiDiag, elevenHealth, heygen, did, yt, fb] = await Promise.all([
      this.openAi.getStatus(),
      this.elevenLabs.getHealth(profile.voiceId),
      this.heygen.testConnection(),
      this.did.testConnection(),
      this.youtubeOAuth.getConnectionStatus(),
      Promise.resolve({ connected: null as boolean | null }),
    ]);

    return {
      ai: {
        configured: aiDiag.configured,
        connected: aiDiag.connected,
      },
      elevenLabs: {
        configured: elevenHealth.apiKeyConfigured,
        connected: elevenHealth.status === 'CONNECTED',
        status: elevenHealth.status,
        voiceStatus: elevenHealth.voiceStatus,
        voiceId: elevenHealth.voiceId,
        latencyMs: elevenHealth.latencyMs ?? null,
        lastError: elevenHealth.lastError ?? null,
      },
      heygen: {
        configured: this.heygen.isConfigured(),
        connected: heygen.ok,
        latencyMs: heygen.latencyMs ?? null,
        lastError: heygen.error ?? null,
      },
      did: {
        configured: this.did.isConfigured(),
        connected: did.ok,
        lastError: did.error ?? null,
      },
      facebook: {
        configured: true,
        connected: fb.connected,
      },
      youtube: {
        configured: yt.configured,
        connected: yt.connected,
      },
    };
  }
}
