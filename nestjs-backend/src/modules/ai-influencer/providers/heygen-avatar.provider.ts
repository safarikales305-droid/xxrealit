import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_AVATAR_COST_PER_SEC_CZK } from '../ai-influencer.constants';
import type {
  AvatarGenerateInput,
  AvatarGenerateStartResult,
  AvatarPollResult,
} from '../ai-influencer.types';
import type { AvatarProvider } from './avatar.provider';
import {
  classifyHeyGenResponse,
  isHeyGenPermissionError,
  parseHeyGenResponseBody,
  type HeyGenConnectionStatus,
  type HeyGenParsedResponse,
} from './heygen-api.util';

export type { HeyGenConnectionStatus } from './heygen-api.util';

export type HeyGenAvatarSelectionStatus = 'SELECTED' | 'NOT_SELECTED';

export type HeyGenAvatarsPermissionStatus =
  | 'PASS'
  | 'FAIL'
  | 'PERMISSION_REQUIRED'
  | 'NOT_CHECKED';

export type HeyGenHealthResult = {
  status: HeyGenConnectionStatus;
  avatarStatus: HeyGenAvatarSelectionStatus;
  avatarsPermission: HeyGenAvatarsPermissionStatus;
  apiKeyConfigured: boolean;
  heygenApiKeyPresent: boolean;
  avatarId: string | null;
  latencyMs?: number;
  lastError?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  detailMessage?: string | null;
};

export type HeyGenAvatarListItem = {
  avatarId: string;
  name: string;
  previewUrl: string | null;
};

export type HeyGenAvatarsResult = {
  avatars: HeyGenAvatarListItem[];
  permission: HeyGenAvatarsPermissionStatus;
  message?: string | null;
};

export type HeyGenAvatarVerifyResult = {
  ok: boolean;
  verified: boolean;
  message: string;
};

@Injectable()
export class HeyGenAvatarProvider implements AvatarProvider, OnModuleInit {
  readonly providerId = 'heygen';
  private readonly log = new Logger(HeyGenAvatarProvider.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKeyConfigured = this.isApiKeyConfigured();
    const avatarSelected = this.isAvatarSelected();
    this.log.log(
      `[AI Influencer] HeyGen API key: ${apiKeyConfigured ? 'CONFIGURED' : 'MISSING'}`,
    );
    this.log.log(
      `[AI Influencer] HeyGen avatar: ${avatarSelected ? 'SELECTED' : 'NOT SELECTED'}`,
    );
  }

  private get apiKey(): string | undefined {
    return this.readEnv('HEYGEN_API_KEY');
  }

  private get defaultAvatarId(): string | undefined {
    return this.readEnv('HEYGEN_AVATAR_ID');
  }

  private readEnv(name: string): string | undefined {
    const raw = this.config.get<string>(name) ?? process.env[name];
    if (!raw) return undefined;
    const trimmed = raw.trim().replace(/^["']|["']$/g, '');
    return trimmed || undefined;
  }

  isApiKeyConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  isAvatarSelected(profileAvatarId?: string | null): boolean {
    return Boolean(profileAvatarId?.trim() || this.defaultAvatarId);
  }

  resolveAvatarId(profileAvatarId?: string | null): string | null {
    return profileAvatarId?.trim() || this.defaultAvatarId || null;
  }

  isConfigured(): boolean {
    return this.isApiKeyConfigured();
  }

  async getHealth(profileAvatarId?: string | null): Promise<HeyGenHealthResult> {
    const avatarId = this.resolveAvatarId(profileAvatarId);
    const avatarStatus: HeyGenAvatarSelectionStatus = avatarId ? 'SELECTED' : 'NOT_SELECTED';
    const apiKeyConfigured = this.isApiKeyConfigured();

    if (!apiKeyConfigured) {
      return {
        status: 'NOT_CONFIGURED',
        avatarStatus,
        avatarsPermission: 'NOT_CHECKED',
        apiKeyConfigured: false,
        heygenApiKeyPresent: false,
        avatarId,
        lastError: 'HEYGEN_API_KEY není nastaven',
      };
    }

    const probe = await this.request('GET', '/v2/avatars');
    let status = classifyHeyGenResponse(probe);

    const avatarsPermission: HeyGenAvatarsPermissionStatus = probe.ok
      ? 'PASS'
      : isHeyGenPermissionError(probe)
        ? 'PERMISSION_REQUIRED'
        : probe.httpStatus === 0
          ? 'NOT_CHECKED'
          : 'FAIL';

    return {
      status,
      avatarStatus,
      avatarsPermission,
      apiKeyConfigured: true,
      heygenApiKeyPresent: true,
      avatarId,
      latencyMs: probe.latencyMs,
      lastError: probe.ok ? null : probe.message,
      httpStatus: probe.httpStatus,
      errorCode: probe.errorCode,
      detailMessage: probe.message,
    };
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const health = await this.getHealth();
    return {
      ok: health.status === 'CONNECTED',
      latencyMs: health.latencyMs,
      error: health.lastError ?? undefined,
    };
  }

  async listAvatarsWithPermission(): Promise<HeyGenAvatarsResult> {
    if (!this.apiKey) {
      return {
        avatars: [],
        permission: 'FAIL',
        message: 'HEYGEN_API_KEY není nastaven',
      };
    }

    const parsed = await this.request('GET', '/v2/avatars');
    if (parsed.ok) {
      const json = JSON.parse(parsed.rawBody || '{}') as {
        data?: {
          avatars?: Array<{
            avatar_id?: string;
            avatar_name?: string;
            preview_image_url?: string;
            preview_url?: string;
          }>;
        };
      };
      const avatars = (json.data?.avatars ?? [])
        .filter((a) => a.avatar_id)
        .map((a) => ({
          avatarId: a.avatar_id!,
          name: a.avatar_name?.trim() || a.avatar_id!,
          previewUrl: a.preview_image_url ?? a.preview_url ?? null,
        }));
      return { avatars, permission: 'PASS' };
    }

    if (isHeyGenPermissionError(parsed)) {
      return {
        avatars: [],
        permission: 'PERMISSION_REQUIRED',
        message: 'API klíč nemá oprávnění číst seznam avatarů v HeyGen.',
      };
    }

    return {
      avatars: [],
      permission: 'FAIL',
      message: parsed.message || `HeyGen avatars HTTP ${parsed.httpStatus}`,
    };
  }

  async verifyAvatar(avatarId: string): Promise<HeyGenAvatarVerifyResult> {
    const trimmed = avatarId.trim();
    if (!trimmed) {
      return { ok: false, verified: false, message: 'Avatar ID je prázdné.' };
    }

    const list = await this.listAvatarsWithPermission();
    if (list.permission === 'PASS') {
      const found = list.avatars.some((a) => a.avatarId === trimmed);
      if (found) {
        return {
          ok: true,
          verified: true,
          message: 'Avatar ID ověřen v seznamu HeyGen.',
        };
      }
      return {
        ok: false,
        verified: false,
        message: 'Avatar ID nebyl nalezen v seznamu HeyGen avatárů.',
      };
    }

    if (list.permission === 'PERMISSION_REQUIRED') {
      return {
        ok: true,
        verified: false,
        message:
          'HeyGen API je připojené. Seznam avatarů není dostupný (oprávnění), ruční Avatar ID nelze ověřit přes API.',
      };
    }

    return {
      ok: false,
      verified: false,
      message: list.message || 'Ověření avataru selhalo.',
    };
  }

  async startGeneration(input: AvatarGenerateInput): Promise<AvatarGenerateStartResult> {
    const apiKey = this.apiKey;
    const avatarId = input.avatarId || this.resolveAvatarId(null);
    if (!apiKey) {
      throw new Error('HEYGEN_API_KEY není nakonfigurován.');
    }
    if (!avatarId) {
      throw new Error('HeyGen je připojen, ale není vybrán avatar.');
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

    const parsed = await this.request('POST', '/v2/video/generate', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!parsed.ok) {
      const status = classifyHeyGenResponse(parsed);
      if (status === 'INVALID_API_KEY') {
        throw Object.assign(new Error('HeyGen AUTH_ERROR'), { code: 'AUTH_ERROR' });
      }
      if (parsed.httpStatus === 402) {
        throw Object.assign(new Error('HeyGen CREDITS_EXHAUSTED'), { code: 'CREDITS_EXHAUSTED' });
      }
      if (status === 'RATE_LIMITED') {
        throw Object.assign(new Error('HeyGen RATE_LIMITED'), { code: 'RATE_LIMITED' });
      }
      throw new Error(parsed.message || `HeyGen generování selhalo (HTTP ${parsed.httpStatus}).`);
    }

    const json = JSON.parse(parsed.rawBody || '{}') as {
      data?: { video_id?: string };
    };
    const externalJobId = json.data?.video_id?.trim();
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
    if (!apiKey) throw new Error('HEYGEN_API_KEY není nakonfigurován.');

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

  private async request(
    method: string,
    path: string,
    init?: { headers?: Record<string, string>; body?: string },
  ): Promise<HeyGenParsedResponse & { rawBody: string; latencyMs: number }> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return {
        httpStatus: 0,
        ok: false,
        errorCode: null,
        message: 'HEYGEN_API_KEY není nastaven',
        rawBody: '',
        latencyMs: 0,
      };
    }

    const started = Date.now();
    try {
      const res = await fetch(`https://api.heygen.com${path}`, {
        method,
        headers: {
          'X-Api-Key': apiKey,
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      });

      const latencyMs = Date.now() - started;
      const rawBody = await res.text();
      const parsedBody = parseHeyGenResponseBody(res.status, rawBody);
      const result = {
        httpStatus: res.status,
        ok: res.ok,
        ...parsedBody,
        rawBody,
        latencyMs,
      };

      if (!res.ok) {
        this.log.warn(
          `[HeyGen] HTTP: ${res.status} | status: ${parsedBody.errorCode ?? '—'} | message: ${parsedBody.message ?? '—'} | path: ${path} | ${latencyMs}ms`,
        );
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`[HeyGen] HTTP: — | status: connection_error | message: ${message}`);
      return {
        httpStatus: 0,
        ok: false,
        errorCode: 'connection_error',
        message,
        rawBody: '',
        latencyMs: Date.now() - started,
      };
    }
  }
}
