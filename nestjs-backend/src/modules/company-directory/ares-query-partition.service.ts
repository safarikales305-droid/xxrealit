import { Injectable, Logger } from '@nestjs/common';
import type { CompanyDirectoryCategory } from '@prisma/client';
import { AresService } from './ares.service';
import type { AresSearchFilter } from './ares.types';
import {
  ARES_MAX_RESULTS_PER_QUERY,
  type AresPartitionContext,
  partitionLabel,
  splitPartitionFurther,
} from './ares-import-split.util';

export type AresPartitionCountResult = {
  total: number | null;
  returnedCount: number;
  httpStatus: number;
};

@Injectable()
export class AresQueryPartitionService {
  private readonly log = new Logger(AresQueryPartitionService.name);

  constructor(private readonly ares: AresService) {}

  async countPartition(
    filter: AresSearchFilter,
    ctx: AresPartitionContext,
    meta?: { partitionId?: string; partitionLabel?: string },
  ): Promise<AresPartitionCountResult> {
    this.logPartitionRequest('COUNT', filter, ctx, meta, { page: 0, limit: 1 });
    try {
      const response = await this.ares.searchCompanies({
        ...filter,
        start: 0,
        pocet: 1,
      });
      const total = response.pocetCelkem ?? null;
      this.logPartitionResult(meta, 200, response.ekonomickeSubjekty?.length ?? 0, total);
      return {
        total,
        returnedCount: response.ekonomickeSubjekty?.length ?? 0,
        httpStatus: 200,
      };
    } catch (err) {
      const status = err && typeof err === 'object' && 'statusCode' in err ? Number((err as { statusCode: number }).statusCode) : 500;
      this.logPartitionResult(meta, status, 0, null);
      throw err;
    }
  }

  needsFurtherSplit(total: number | null): boolean {
    return total != null && total > ARES_MAX_RESULTS_PER_QUERY;
  }

  furtherPartitions(
    filter: AresSearchFilter,
    ctx: AresPartitionContext,
    depth: number,
  ): Array<{ filter: AresSearchFilter; label: string; depth: number }> {
    return splitPartitionFurther(filter, ctx, depth);
  }

  logPartitionRequest(
    kind: 'COUNT' | 'FETCH' | 'SPLIT',
    filter: AresSearchFilter,
    ctx: AresPartitionContext,
    meta?: { partitionId?: string; partitionLabel?: string },
    paging?: { page: number; limit: number },
  ) {
    const sidlo = filter.sidlo ?? {};
    this.log.log(
      JSON.stringify({
        kind,
        partitionId: meta?.partitionId ?? null,
        partitionLabel: meta?.partitionLabel ?? partitionLabel(filter, ctx),
        category: ctx.category ?? null,
        economicActivity: filter.czNace ?? [],
        region: sidlo.kodKraje ?? null,
        district: sidlo.nazevOkresu ?? null,
        municipality: sidlo.nazevObce ?? null,
        searchText: sidlo.textovaAdresa ?? null,
        page: paging?.page ?? filter.start ?? 0,
        limit: paging?.limit ?? filter.pocet ?? null,
      }),
    );
  }

  private logPartitionResult(
    meta: { partitionId?: string; partitionLabel?: string } | undefined,
    httpStatus: number,
    returnedCount: number,
    totalCount: number | null,
  ) {
    this.log.log(
      JSON.stringify({
        kind: 'RESULT',
        partitionId: meta?.partitionId ?? null,
        partitionLabel: meta?.partitionLabel ?? null,
        httpStatus,
        returnedCount,
        totalCount,
      }),
    );
  }

  buildContext(job: {
    category?: CompanyDirectoryCategory | null;
    region?: string | null;
    district?: string | null;
    city?: string | null;
  }): AresPartitionContext {
    return {
      category: job.category,
      region: job.region,
      district: job.district,
      city: job.city,
      wholeCountry: false,
    };
  }
}
