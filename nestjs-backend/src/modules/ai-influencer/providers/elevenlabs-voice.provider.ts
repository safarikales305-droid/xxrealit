import { createHash } from 'node:crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_VOICE_COST_PER_1K_CHARS_CZK } from '../ai-influencer.constants';
import type { VoiceGenerateInput, VoiceGenerateResult } from '../ai-influencer.types';
import type { VoiceProvider } from './voice.provider';

export type ElevenLabsConnectionStatus =
  | 'NOT_CONFIGURED'
  | 'CONNECTED'
  | 'INVALID_API_KEY'
  | 'CONNECTION_ERROR';

export type ElevenLabsVoiceSelectionStatus = 'SELECTED' | 'NOT_SELECTED';

export type ElevenLabsHealthResult = {
  status: ElevenLabsConnectionStatus;
  voiceStatus: ElevenLabsVoiceSelectionStatus;
  apiKeyConfigured: boolean;
  voiceId: string | null;
  latencyMs?: number;
  lastError?: string | null;
};

export type ElevenLabsVoiceListItem = {
  voiceId: string;
  name: string;
  category: string | null;
  previewUrl: string | null;
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
    const fromConfig = this.config.get<string>(name)?.trim();
    if (fromConfig) return fromConfig;
    const fromProcess = process.env[name]?.trim();
    return fromProcess || undefined;
  }

  /** API key present — does not require voice ID. */
  isApiKeyConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  isVoiceSelected(profileVoiceId?: string | null): boolean {
    return Boolean(profileVoiceId?.trim() || this.defaultVoiceId);
  }

  resolveVoiceId(profileVoiceId?: string | null): string | null {
    return profileVoiceId?.trim() || this.defaultVoiceId || null;
  }

  /** Backward-compatible: configured = API key only. */
  isConfigured(): boolean {
    return this.isApiKeyConfigured();
  }

  async getHealth(profileVoiceId?: string | null): Promise<ElevenLabsHealthResult> {
    const apiKeyConfigured = this.isApiKeyConfigured();
    const voiceId = this.resolveVoiceId(profileVoiceId);
    const voiceStatus: ElevenLabsVoiceSelectionStatus = voiceId ? 'SELECTED' : 'NOT_SELECTED';

    if (!apiKeyConfigured) {
      return {
        status: 'NOT_CONFIGURED',
        voiceStatus,
        apiKeyConfigured: false,
        voiceId,
        lastError: 'ELEVENLABS_API_KEY není nastaven',
      };
    }

    const probe = await this.probeApiKey();
    return {
      status: probe.status,
      voiceStatus,
      apiKeyConfigured: true,
      voiceId,
      latencyMs: probe.latencyMs,
      lastError: probe.lastError ?? null,
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

  async listVoices(): Promise<ElevenLabsVoiceListItem[]> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY není nastaven');
    }

    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });

    if (res.status === 401) {
      throw Object.assign(new Error('ElevenLabs INVALID_API_KEY'), { code: 'INVALID_API_KEY' });
    }
    if (!res.ok) {
      throw new Error(`ElevenLabs voices HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      voices?: Array<{
        voice_id?: string;
        name?: string;
        category?: string;
        preview_url?: string;
      }>;
    };

    return (json.voices ?? [])
      .filter((v) => v.voice_id && v.name)
      .map((v) => ({
        voiceId: v.voice_id!,
        name: v.name!,
        category: v.category ?? null,
        previewUrl: v.preview_url ?? null,
      }));
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

    const body = {
      text,
      model_id: this.modelId,
      voice_settings: {
        stability: input.stability ?? 0.5,
        similarity_boost: 0.75,
        style: input.style ?? 0.35,
        use_speaker_boost: true,
        speed: input.speed ?? 1,
      },
    };

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });

    if (res.status === 401) {
      throw Object.assign(new Error('ElevenLabs AUTH_ERROR'), { code: 'AUTH_ERROR' });
    }
    if (res.status === 402) {
      throw Object.assign(new Error('ElevenLabs CREDITS_EXHAUSTED'), { code: 'CREDITS_EXHAUSTED' });
    }
    if (res.status === 429) {
      throw Object.assign(new Error('ElevenLabs RATE_LIMITED'), { code: 'RATE_LIMITED' });
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      this.log.warn(`ElevenLabs TTS failed: ${res.status} ${errText.slice(0, 200)}`);
      throw new Error(`ElevenLabs TTS selhalo (HTTP ${res.status}).`);
    }

    const arrayBuf = await res.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuf);
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

  private async probeApiKey(): Promise<{
    status: ElevenLabsConnectionStatus;
    latencyMs?: number;
    lastError?: string;
  }> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      return { status: 'NOT_CONFIGURED', lastError: 'ELEVENLABS_API_KEY není nastaven' };
    }

    const started = Date.now();
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': apiKey },
      });
      const latencyMs = Date.now() - started;
      if (res.status === 401 || res.status === 403) {
        return {
          status: 'INVALID_API_KEY',
          latencyMs,
          lastError: `HTTP ${res.status}`,
        };
      }
      if (!res.ok) {
        return {
          status: 'CONNECTION_ERROR',
          latencyMs,
          lastError: `HTTP ${res.status}`,
        };
      }
      return { status: 'CONNECTED', latencyMs };
    } catch (err) {
      return {
        status: 'CONNECTION_ERROR',
        latencyMs: Date.now() - started,
        lastError: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
