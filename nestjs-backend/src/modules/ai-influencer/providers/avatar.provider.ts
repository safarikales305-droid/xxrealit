import type {
  AvatarGenerateInput,
  AvatarGenerateStartResult,
  AvatarPollResult,
} from '../ai-influencer.types';

export interface AvatarProvider {
  readonly providerId: string;
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  startGeneration(input: AvatarGenerateInput): Promise<AvatarGenerateStartResult>;
  pollGeneration(externalJobId: string): Promise<AvatarPollResult>;
  downloadResult(videoUrl: string): Promise<Buffer>;
}
