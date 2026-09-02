import type { VoiceGenerateInput, VoiceGenerateResult } from '../ai-influencer.types';

export interface VoiceProvider {
  readonly providerId: string;
  /** True when API credentials are present (voice selection is separate). */
  isConfigured(): boolean;
  isVoiceSelected(profileVoiceId?: string | null): boolean;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
  generateSpeech(input: VoiceGenerateInput): Promise<VoiceGenerateResult>;
}
