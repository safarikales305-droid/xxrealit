import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_VOICE_COST_PER_1K_CHARS_CZK } from '../ai-influencer.constants';
import type { VoiceGenerateInput, VoiceGenerateResult } from '../ai-influencer.types';
import type { VoiceProvider } from './voice.provider';
import {
  classifyElevenLabsResponse,
  isElevenLabsPermissionError,
  parseElevenLabsResponseBody,
  type ElevenLabsConnectionStatus,
  type ElevenLabsParsedResponse,
} from './elevenlabs-api.util';

export type { ElevenLabsConnectionStatus } from './elevenlabs-api.util';

export type ElevenLabsVoiceSelectionStatus = 'SELECTED' | 'NOT_SELECTED';

export type ElevenLabsVoicesPermissionStatus =
  | 'PASS'
  | 'FAIL'
  | 'PERMISSION_REQUIRED'
  | 'NOT_CHECKED';

export type ElevenLabsTtsPermissionStatus = 'PASS' | 'FAIL' | 'NOT_CHECKED';

export type ElevenLabsHealthResult = {
  status: ElevenLabsConnectionStatus;
  voiceStatus: ElevenLabsVoiceSelectionStatus;
  voicesPermission: ElevenLabsVoicesPermissionStatus;
  ttsPermission: ElevenLabsTtsPermissionStatus;
  apiKeyConfigured: boolean;
  voiceId: string | null;
  latencyMs?: number;
  lastError?: string | null;
  httpStatus?: number | null;
  detailStatus?: string | null;
  detailMessage?: string | null;
};

export type ElevenLabsVoiceListItem = {
  voiceId: string;
  name: string;
  category: string | null;
  previewUrl: string | null;
};

export type ElevenLabsVoicesResult = {
  voices: ElevenLabsVoiceListItem[];
  permission: ElevenLabsVoicesPermissionStatus;
  message?: string | null;
};

@Injectable()
export class ElevenLabsVoiceProvider implements VoiceProvider, OnModuleInit {
  readonly providerId = 'elevenlabs';
  private readonly log = new Logger(ElevenLabsVoiceProvider.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const apiKeyConfigured = this.isApiKeyConfigured();
    const voiceSelected = this.isVoiceSelected();
    this.log.log(
      `[AI Influencer] ElevenLabs API key: ${apiKeyConfigured ? 'CONFIGURED' : 'MISSING'}`,
    );
    this.log.log(
      `[AI Influencer] ElevenLabs voice: ${voiceSelected ? 'SELECTED' : 'NOT SELECTED'}`,
    );
  }

  private get apiKey(): string | undefined {
    return this.readEnv('ELEVENLABS_API_KEY');
  }

  private get defaultVoiceId(): string | undefined {
    return this.readEnv('ELEVENLABS_VOICE_ID');
  }

  private get modelId(): string {
    return this.readEnv('ELEVENLABS_MODEL_ID') ?? 'eleven_multilingual_v2';
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

  isVoiceSelected(profileVoiceId?: string | null): boolean {
    return Boolean(profileVoiceId?.trim() || this.defaultVoiceId);
  }

  resolveVoiceId(profileVoiceId?: string | null): string | null {
    return profileVoiceId?.trim() || this.defaultVoiceId || null;
  }

  isConfigured(): boolean {
    return this.isApiKeyConfigured();
  }

  async getHealth(profileVoiceId?: string | null): Promise<ElevenLabsHealthResult> {
    const voiceId = this.resolveVoiceId(profileVoiceId);
    const voiceStatus: ElevenLabsVoiceSelectionStatus = voiceId ? 'SELECTED' : 'NOT_SELECTED';

    if (!this.isApiKeyConfigured()) {
      return {
        status: 'NOT_CONFIGURED',
        voiceStatus,
        voicesPermission: 'NOT_CHECKED',
        ttsPermission: 'NOT_CHECKED',
        apiKeyConfigured: false,
        voiceId,
        lastError: 'ELEVENLABS_API_KEY není nastaven',
      };
    }

    const modelsProbe = await this.request('GET', '/v1/models');
    let status = classifyElevenLabsResponse(modelsProbe);
    let ttsPermission: ElevenLabsTtsPermissionStatus = 'NOT_CHECKED';
    const latencyMs = modelsProbe.latencyMs;

    if (
      (status === 'INSUFFICIENT_PERMISSIONS' || status === 'CONNECTION_ERROR') &&
      voiceId
    ) {
      const ttsProbe = await this.probeTts(voiceId, 'Ahoj.');
      ttsPermission = ttsProbe.ok ? 'PASS' : 'FAIL';
      if (ttsProbe.ok) {
        status = 'CONNECTED';
      }
    }

    const voicesProbe = await this.request('GET', '/v1/voices');
    const voicesPermission: ElevenLabsVoicesPermissionStatus = voicesProbe.ok
      ? 'PASS'
      : isElevenLabsPermissionError(voicesProbe)
        ? 'PERMISSION_REQUIRED'
        : 'FAIL';

    if (status === 'INSUFFICIENT_PERMISSIONS' && ttsPermission === 'PASS') {
      status = 'CONNECTED';
    }

    return {
      status,
      voiceStatus,
      voicesPermission,
      ttsPermission,
      apiKeyConfigured: true,
      voiceId,
      latencyMs,
      lastError: modelsProbe.ok ? null : modelsProbe.message,
      httpStatus: modelsProbe.httpStatus,
      detailStatus: modelsProbe.detailStatus ?? modelsProbe.detailCode,
      detailMessage: modelsProbe.message,
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

  async listVoicesWithPermission(): Promise<ElevenLabsVoicesResult> {
    if (!this.apiKey) {
      return {
        voices: [],
        permission: 'FAIL',
        message: 'ELEVENLABS_API_KEY není nastaven',
      };
    }

    const parsed = await this.request('GET', '/v1/voices');
    if (parsed.ok) {
      const json = JSON.parse(parsed.rawBody || '{}') as {
        voices?: Array<{
          voice_id?: string;
          name?: string;
          category?: string;
          preview_url?: string;
        }>;
      };
      const voices = (json.voices ?? [])
        .filter((v) => v.voice_id && v.name)
        .map((v) => ({
          voiceId: v.voice_id!,
          name: v.name!,
          category: v.category ?? null,
          previewUrl: v.preview_url ?? null,
        }));
      return { voices, permission: 'PASS' };
    }

    if (isElevenLabsPermissionError(parsed)) {
      return {
        voices: [],
        permission: 'PERMISSION_REQUIRED',
        message:
          'API klíč nemá oprávnění číst seznam hlasů. Povolte Voices read v ElevenLabs API key.',
      };
    }

    return {
      voices: [],
      permission: 'FAIL',
      message: parsed.message || `ElevenLabs voices HTTP ${parsed.httpStatus}`,
    };
  }

  async listVoices(): Promise<ElevenLabsVoiceListItem[]> {
    const result = await this.listVoicesWithPermission();
    if (result.permission === 'PERMISSION_REQUIRED') {
      throw Object.assign(new Error(result.message || 'Voices read permission required'), {
        code: 'VOICES_PERMISSION_REQUIRED',
      });
    }
    if (result.permission !== 'PASS') {
      throw new Error(result.message || 'ElevenLabs voices request failed');
    }
    return result.voices;
  }

  async generateSpeech(input: VoiceGenerateInput): Promise<VoiceGenerateResult> {
    const apiKey = this.apiKey;
    const voiceId = input.voiceId || this.defaultVoiceId;
    if (!apiKey) {
      throw new Error('ElevenLabs API key není nastaven (ELEVENLABS_API_KEY).');
    }
    if (!voiceId) {
      throw new Error('ElevenLabs je připojen. Nejprve vyberte hlas.');
    }

    const text = input.text.trim();
    if (!text) throw new Error('Text pro voice-over je prázdný.');

    const contentHash = createHash('sha256')
      .update(`${voiceId}:${this.modelId}:${text}:${input.speed ?? 1}:${input.stability ?? 0.5}`)
      .digest('hex');

    const parsed = await this.request('POST', `/v1/text-to-speech/${voiceId}`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.modelId,
        voice_settings: {
          stability: input.stability ?? 0.5,
          similarity_boost: 0.75,
          style: input.style ?? 0.35,
          use_speaker_boost: true,
          speed: input.speed ?? 1,
        },
      }),
      responseType: 'arrayBuffer',
    });

    if (!parsed.ok) {
      const status = classifyElevenLabsResponse(parsed);
      if (status === 'INVALID_API_KEY') {
        throw Object.assign(new Error('ElevenLabs AUTH_ERROR'), { code: 'AUTH_ERROR' });
      }
      if (status === 'QUOTA_EXCEEDED') {
        throw Object.assign(new Error('ElevenLabs CREDITS_EXHAUSTED'), { code: 'CREDITS_EXHAUSTED' });
      }
      if (status === 'RATE_LIMITED') {
        throw Object.assign(new Error('ElevenLabs RATE_LIMITED'), { code: 'RATE_LIMITED' });
      }
      if (status === 'INSUFFICIENT_PERMISSIONS') {
        throw Object.assign(new Error('ElevenLabs INSUFFICIENT_PERMISSIONS'), {
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }
      throw new Error(parsed.message || `ElevenLabs TTS selhalo (HTTP ${parsed.httpStatus}).`);
    }

    const audioBuffer = Buffer.from(parsed.rawBuffer ?? new ArrayBuffer(0));
    if (!audioBuffer.length) throw new Error('ElevenLabs vrátilo prázdné audio.');

    const chars = text.length;
    const costEstimatedCzk = (chars / 1000) * DEFAULT_VOICE_COST_PER_1K_CHARS_CZK;
    const words = text.split(/\s+/).filter(Boolean).length;
    const durationSec = Math.max(5, Math.round((words / 2.6) * 10) / 10);

    return {
      audioBuffer,
      mimeType: 'audio/mpeg',
      durationSec,
      costEstimatedCzk,
      contentHash,
    };
  }

  private async probeTts(voiceId: string, text: string): Promise<{ ok: boolean }> {
    const parsed = await this.request('POST', `/v1/text-to-speech/${voiceId}`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.modelId,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
      responseType: 'arrayBuffer',
    });
    return { ok: parsed.ok };
  }

  private async request(
    method: string,
    path: string,
    init?: {
      headers?: Record<string, string>;
      body?: string;
      responseType?: 'text' | 'arrayBuffer';
    },
  ): Promise<
    ElevenLabsParsedResponse & { rawBody: string; rawBuffer?: ArrayBuffer; latencyMs: number }
  > {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return {
        httpStatus: 0,
        ok: false,
        detailCode: null,
        detailStatus: null,
        detailType: null,
        message: 'ELEVENLABS_API_KEY není nastaven',
        rawBody: '',
        latencyMs: 0,
      };
    }

    const started = Date.now();
    try {
      const res = await fetch(`https://api.elevenlabs.io${path}`, {
        method,
        headers: {
          'xi-api-key': apiKey,
          ...(init?.headers ?? {}),
        },
        body: init?.body,
      });

      const latencyMs = Date.now() - started;
      const responseType = init?.responseType ?? 'text';

      if (res.ok && responseType === 'arrayBuffer') {
        const rawBuffer = await res.arrayBuffer();
        return {
          httpStatus: res.status,
          ok: true,
          detailCode: null,
          detailStatus: null,
          detailType: null,
          message: null,
          rawBody: '',
          rawBuffer,
          latencyMs,
        };
      }

      const rawBody = await res.text();
      const parsedBody = parseElevenLabsResponseBody(res.status, rawBody);
      const result = {
        httpStatus: res.status,
        ok: res.ok,
        ...parsedBody,
        rawBody,
        latencyMs,
      };

      if (!res.ok) {
        this.log.warn(
          `[ElevenLabs] HTTP: ${res.status} | status: ${parsedBody.detailStatus ?? parsedBody.detailCode ?? '—'} | message: ${parsedBody.message ?? '—'} | path: ${path} | ${latencyMs}ms`,
        );
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`[ElevenLabs] HTTP: — | status: connection_error | message: ${message}`);
      return {
        httpStatus: 0,
        ok: false,
        detailCode: 'connection_error',
        detailStatus: null,
        detailType: null,
        message,
        rawBody: '',
        latencyMs: Date.now() - started,
      };
    }
  }
}
