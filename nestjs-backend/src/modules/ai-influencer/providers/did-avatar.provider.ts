import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AvatarGenerateInput,
  AvatarGenerateStartResult,
  AvatarPollResult,
} from '../ai-influencer.types';
import type { AvatarProvider } from './avatar.provider';

@Injectable()
export class DIdAvatarProvider implements AvatarProvider {
  readonly providerId = 'did';

  constructor(private readonly config: ConfigService) {}

  private get apiKey(): string | undefined {
    return this.config.get<string>('DID_API_KEY')?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  isAvatarSelected(profileAvatarId?: string | null): boolean {
    return Boolean(profileAvatarId?.trim() || this.config.get<string>('DID_AVATAR_ID')?.trim());
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    if (!this.apiKey) return { ok: false, error: 'DID_API_KEY není nastaven' };
    return { ok: false, error: 'D-ID provider je připraven, ale zatím není implementován.' };
  }

  async startGeneration(_input: AvatarGenerateInput): Promise<AvatarGenerateStartResult> {
    void _input;
    throw new Error('D-ID avatar provider není v Phase 1 aktivní. Použijte HeyGen.');
  }

  async pollGeneration(_externalJobId: string): Promise<AvatarPollResult> {
    void _externalJobId;
    return { status: 'FAILED', errorMessage: 'D-ID není implementováno.' };
  }

  async downloadResult(_videoUrl: string): Promise<Buffer> {
    void _videoUrl;
    throw new Error('D-ID není implementováno.');
  }
}
