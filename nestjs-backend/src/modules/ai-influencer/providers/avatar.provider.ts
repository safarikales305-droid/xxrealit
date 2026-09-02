import type {
  AvatarGenerateInput,
  AvatarGenerateStartResult,
  AvatarPollResult,
} from '../ai-influencer.types';

export interface AvatarProvider {
  readonly providerId: string;
  /** True when API credentials are present (avatar selection is separate). */
  isConfigured(): boolean;
  isAvatarSelected(profileAvatarId?: string | null): boolean;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  startGeneration(input: AvatarGenerateInput): Promise<AvatarGenerateStartResult>;
  pollGeneration(externalJobId: string): Promise<AvatarPollResult>;
  downloadResult(videoUrl: string): Promise<Buffer>;
}
