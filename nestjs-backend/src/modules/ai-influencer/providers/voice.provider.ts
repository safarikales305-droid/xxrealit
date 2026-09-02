import type { VoiceGenerateInput, VoiceGenerateResult } from '../ai-influencer.types';

export interface VoiceProvider {
  readonly providerId: string;
  isConfigured(): boolean;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  generateSpeech(input: VoiceGenerateInput): Promise<VoiceGenerateResult>;
}
