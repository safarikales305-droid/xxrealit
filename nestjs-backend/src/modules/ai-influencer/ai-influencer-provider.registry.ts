import { Injectable } from '@nestjs/common';
import { AiAvatarProviderType, AiVoiceProviderType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { DIdAvatarProvider } from './providers/did-avatar.provider';
import { ElevenLabsVoiceProvider } from './providers/elevenlabs-voice.provider';
import { HeyGenAvatarProvider } from './providers/heygen-avatar.provider';
import type { AvatarProvider } from './providers/avatar.provider';
import type { VoiceProvider } from './providers/voice.provider';
import { getHeyGenRuntimeConfig } from './ai-influencer-runtime-config.util';

@Injectable()
export class AiInfluencerProviderRegistry {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly elevenLabs: ElevenLabsVoiceProvider,
    private readonly heygen: HeyGenAvatarProvider,
    private readonly did: DIdAvatarProvider,
  ) {}

  getVoiceProvider(type: AiVoiceProviderType = 'ELEVENLABS'): VoiceProvider {
    if (type === 'ELEVENLABS') return this.elevenLabs;
    return this.elevenLabs;
  }

  getAvatarProvider(type: AiAvatarProviderType = 'HEYGEN'): AvatarProvider {
    if (type === 'DID') return this.did;
    return this.heygen;
  }

  resolveVoiceId(profileVoiceId?: string | null) {
    return profileVoiceId?.trim() || this.config.get<string>('ELEVENLABS_VOICE_ID')?.trim() || null;
  }

  resolveAvatarId(profileAvatarId?: string | null) {
    return profileAvatarId?.trim() || getHeyGenRuntimeConfig().avatarId || null;
  }

  async getDefaultProfile() {
    const existing = await this.prisma.aiInfluencerProfile.findFirst({
      where: { enabled: true },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) return existing;
    return this.prisma.aiInfluencerProfile.create({
      data: {
        name: 'XXREALIT AI redaktorka',
        slug: 'xxrealit-ai-redaktorka',
        avatarProvider: 'HEYGEN',
        avatarId: this.resolveAvatarId(null),
        voiceProvider: 'ELEVENLABS',
        voiceId: this.resolveVoiceId(null),
        language: 'cs-CZ',
        personalityPrompt:
          'Jsi virtuální AI redaktorka XXREALIT. Moderní, důvěryhodný, rychlý a srozumitelný tón. Nikdy netvrdíš, že jsi skutečný člověk.',
        defaultStyle: 'energický_informativní',
        defaultDuration: 35,
        virtualPresenter: true,
        enabled: true,
      },
    });
  }
}
