import { Injectable } from '@nestjs/common';
import {
  ProviderGenerationStatus,
  ProviderGenerationType,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class ProviderGenerationService {
  constructor(private readonly prisma: PrismaService) {}

  async findCached(type: ProviderGenerationType, contentHash: string, provider: string) {
    return this.prisma.providerGeneration.findUnique({
      where: {
        type_contentHash_provider: { type, contentHash, provider },
      },
    });
  }

  async markReady(input: {
    type: ProviderGenerationType;
    contentHash: string;
    provider: string;
    jobId?: string;
    storageUrl?: string;
    storagePath?: string;
    costEstimated?: number;
    externalJobId?: string;
  }) {
    return this.prisma.providerGeneration.upsert({
      where: {
        type_contentHash_provider: {
          type: input.type,
          contentHash: input.contentHash,
          provider: input.provider,
        },
      },
      create: {
        type: input.type,
        contentHash: input.contentHash,
        provider: input.provider,
        jobId: input.jobId,
        status: ProviderGenerationStatus.READY,
        storageUrl: input.storageUrl,
        storagePath: input.storagePath,
        costEstimated: input.costEstimated ?? 0,
        externalJobId: input.externalJobId,
      },
      update: {
        jobId: input.jobId,
        status: ProviderGenerationStatus.READY,
        storageUrl: input.storageUrl,
        storagePath: input.storagePath,
        costEstimated: input.costEstimated ?? 0,
        externalJobId: input.externalJobId,
        errorMessage: null,
      },
    });
  }

  async markFailed(type: ProviderGenerationType, contentHash: string, provider: string, message: string) {
    return this.prisma.providerGeneration.upsert({
      where: { type_contentHash_provider: { type, contentHash, provider } },
      create: {
        type,
        contentHash,
        provider,
        status: ProviderGenerationStatus.FAILED,
        errorMessage: message,
      },
      update: {
        status: ProviderGenerationStatus.FAILED,
        errorMessage: message,
      },
    });
  }
}
