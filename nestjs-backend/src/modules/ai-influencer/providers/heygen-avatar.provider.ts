import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_AVATAR_COST_PER_SEC_CZK } from '../ai-influencer.constants';
import type {
  AvatarGenerateInput,
  AvatarGenerateStartResult,
  AvatarPollResult,
} from '../ai-influencer.types';
import type { AvatarProvider } from './avatar.provider';

@Injectable()
export class HeyGenAvatarProvider implements AvatarProvider {
  readonly providerId = 'heygen';
  private readonly log = new Logger(HeyGenAvatarProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('HEYGEN_API_KEY')?.trim() || undefined;
  }

  private get defaultAvatarId(): string | undefined {
    return this.config.get<string>('HEYGEN_AVATAR_ID')?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.defaultAvatarId);
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    if (!this.apiKey) return { ok: false, error: 'HEYGEN_API_KEY není nastaven' };
    const started = Date.now();
    try {
      const res = await fetch('https://api.heygen.com/v2/avatars', {
        headers: { 'X-Api-Key': this.apiKey },
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      }
      return { ok: true, latencyMs };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async startGeneration(input: AvatarGenerateInput): Promise<AvatarGenerateStartResult> {
    const apiKey = this.apiKey;
    const avatarId = input.avatarId || this.defaultAvatarId;
    if (!apiKey || !avatarId) {
      throw new Error('HeyGen není nakonfigurován (API key / avatar ID).');
    }

    const width = input.width ?? 1080;
    const height = input.height ?? 1920;
    const contentHash = createHash('sha256')
      .update(`${avatarId}:${input.audioUrl ?? ''}:${input.text ?? ''}:${width}x${height}`)
      .digest('hex');

    const voice =
      input.audioUrl?.trim()
        ? { type: 'audio', audio_url: input.audioUrl.trim() }
        : input.text?.trim()
          ? {
              type: 'text',
              input_text: input.text.trim(),
              voice_id: input.voiceId || undefined,
            }
          : null;

    if (!voice) {
      throw new Error('HeyGen vyžaduje audio URL nebo text.');
    }

    const payload = {
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatarId,
            avatar_style: 'normal',
          },
          voice,
        },
      ],
      dimension: { width, height },
    };

    const res = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      throw Object.assign(new Error('HeyGen AUTH_ERROR'), { code: 'AUTH_ERROR' });
    }
    if (res.status === 402) {
      throw Object.assign(new Error('HeyGen CREDITS_EXHAUSTED'), { code: 'CREDITS_EXHAUSTED' });
    }
    if (res.status === 429) {
      throw Object.assign(new Error('HeyGen RATE_LIMITED'), { code: 'RATE_LIMITED' });
    }

    const json = (await res.json().catch(() => null)) as {
      data?: { video_id?: string };
      error?: { message?: string };
    } | null;

    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      this.log.warn(`HeyGen generate failed: ${msg}`);
      throw new Error(`HeyGen generování selhalo: ${msg}`);
    }

    const externalJobId = json?.data?.video_id?.trim();
    if (!externalJobId) {
      throw new Error('HeyGen nevrátilo video_id.');
    }

    const estimatedSec = input.text ? Math.max(10, input.text.split(/\s+/).length / 2.5) : 30;
    return {
      externalJobId,
      costEstimatedCzk: estimatedSec * DEFAULT_AVATAR_COST_PER_SEC_CZK,
      contentHash,
    };
  }

  async pollGeneration(externalJobId: string): Promise<AvatarPollResult> {
    const apiKey = this.apiKey;
    if (!apiKey) throw new Error('HeyGen není nakonfigurován.');

    const res = await fetch(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(externalJobId)}`,
      { headers: { 'X-Api-Key': apiKey } },
    );

    const json = (await res.json().catch(() => null)) as {
      data?: {
        status?: string;
        video_url?: string;
        error?: { message?: string };
      };
    } | null;

    if (!res.ok) {
      return { status: 'FAILED', errorMessage: `HTTP ${res.status}` };
    }

    const status = (json?.data?.status ?? '').toLowerCase();
    if (status === 'completed' || status === 'complete') {
      const videoUrl = json?.data?.video_url?.trim();
      if (!videoUrl) return { status: 'FAILED', errorMessage: 'Chybí video URL' };
      return { status: 'READY', videoUrl };
    }
    if (status === 'failed' || status === 'error') {
      return {
        status: 'FAILED',
        errorMessage: json?.data?.error?.message || 'HeyGen generování selhalo',
      };
    }
    if (status === 'pending' || status === 'waiting') {
      return { status: 'QUEUED' };
    }
    return { status: 'GENERATING' };
  }

  async downloadResult(videoUrl: string): Promise<Buffer> {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Stažení HeyGen videa selhalo (HTTP ${res.status}).`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('Stažené HeyGen video je prázdné.');
    if (buf.length > 200 * 1024 * 1024) {
      throw new Error('HeyGen video překračuje maximální velikost.');
    }
    const mime = res.headers.get('content-type') ?? '';
    if (mime && !mime.includes('video') && !mime.includes('octet-stream')) {
      throw new Error(`Neočekávaný MIME typ HeyGen videa: ${mime}`);
    }
    return buf;
  }
}
