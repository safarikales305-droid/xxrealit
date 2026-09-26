import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { OpenAiConfigService } from '../../openai/openai-config.service';
import type {
  RenovationImageProvider,
  RenovationImageProviderResult,
} from './renovation-image.provider';

@Injectable()
export class OpenAiRenovationImageProvider implements RenovationImageProvider {
  readonly providerId = 'openai';
  private readonly log = new Logger(OpenAiRenovationImageProvider.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: OpenAiConfigService) {}

  isReady(): boolean {
    return this.config.isApiKeyConfigured();
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.config.apiKey;
      if (!apiKey) throw new Error('OpenAI API key missing');
      this.client = new OpenAI({ apiKey, timeout: 120_000 });
    }
    return this.client;
  }

  async generateRenovation(input: {
    imagePngBuffer: Buffer;
    prompt: string;
    model: string;
    quality?: string;
  }): Promise<RenovationImageProviderResult> {
    const client = this.getClient();
    const model = input.model?.trim() || 'gpt-image-1';
    const file = await toFile(input.imagePngBuffer, 'source.png', { type: 'image/png' });

    try {
      const response = await client.images.edit({
        model,
        image: file,
        prompt: input.prompt,
        size: '1024x1024',
      });

      const b64 = response.data?.[0]?.b64_json;
      if (!b64) {
        throw new Error('OpenAI nevrátilo obrázek.');
      }

      return {
        imageBuffer: Buffer.from(b64, 'base64'),
        model,
        provider: this.providerId,
        usageMeta: {
          revisedPrompt: response.data?.[0]?.revised_prompt ?? null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log.warn(`[openai-renovation] ${message}`);
      throw err;
    }
  }
}
