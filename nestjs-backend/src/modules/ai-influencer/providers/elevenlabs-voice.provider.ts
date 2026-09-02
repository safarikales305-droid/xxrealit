import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_VOICE_COST_PER_1K_CHARS_CZK,
} from '../ai-influencer.constants';
import type { VoiceGenerateInput, VoiceGenerateResult } from '../ai-influencer.types';
import type { VoiceProvider } from './voice.provider';

@Injectable()
export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly providerId = 'elevenlabs';
  private readonly log = new Logger(ElevenLabsVoiceProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('ELEVENLABS_API_KEY')?.trim() || undefined;
  }

  private get defaultVoiceId(): string | undefined {
    return this.config.get<string>('ELEVENLABS_VOICE_ID')?.trim() || undefined;
  }

  private get modelId(): string {
    return this.config.get<string>('ELEVENLABS_MODEL_ID')?.trim() || 'eleven_multilingual_v2';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.defaultVoiceId);
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    if (!this.apiKey) return { ok: false, error: 'ELEVENLABS_API_KEY není nastaven' };
    const started = Date.now();
    try {
      const res = await fetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': this.apiKey },
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

  async generateSpeech(input: VoiceGenerateInput): Promise<VoiceGenerateResult> {
    const apiKey = this.apiKey;
    const voiceId = input.voiceId || this.defaultVoiceId;
    if (!apiKey || !voiceId) {
      throw new Error('ElevenLabs není nakonfigurován (API key / voice ID).');
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
}
