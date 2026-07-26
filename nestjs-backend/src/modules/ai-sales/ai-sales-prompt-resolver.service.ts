import { Injectable, Logger } from '@nestjs/common';
import { AiPromptStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DEFAULT_AI_SALES_MAIN_PROMPT } from './ai-sales-default-prompts';
import { AI_SALES_PROMPT_FEATURES } from './ai-sales.constants';

@Injectable()
export class AiSalesPromptResolverService {
  private readonly log = new Logger(AiSalesPromptResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveActive(
    feature: string,
    variables: Record<string, string> = {},
  ): Promise<{ id: string | null; version: string; systemPrompt: string }> {
    const row = await this.prisma.aiPromptVersion.findFirst({
      where: { feature, status: AiPromptStatus.ACTIVE },
      orderBy: { activatedAt: 'desc' },
    });

    const base = row?.systemPrompt ?? DEFAULT_AI_SALES_MAIN_PROMPT;
    const systemPrompt = base.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
      return variables[key] ?? '';
    });

    return {
      id: row?.id ?? null,
      version: row?.version ?? 'builtin-v1',
      systemPrompt,
    };
  }
}
