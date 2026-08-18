import { Injectable } from '@nestjs/common';
import { CompanyImportPartitionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { AresSearchFilter } from './ares.types';

export type PartitionSpec = {
  filter: AresSearchFilter;
  label: string;
  depth: number;
};

@Injectable()
export class CompanyImportPartitionService {
  constructor(private readonly prisma: PrismaService) {}

  async createInitialPartitions(jobId: string, specs: PartitionSpec[]) {
    if (!specs.length) return [];
    await this.prisma.companyImportPartition.createMany({
      data: specs.map((spec, index) => ({
        jobId,
        sortOrder: index,
        depth: spec.depth,
        label: spec.label,
        filtersJson: spec.filter as Prisma.InputJsonValue,
        status: CompanyImportPartitionStatus.PENDING,
      })),
    });
    return this.prisma.companyImportPartition.findMany({
      where: { jobId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getNextWorkPartition(jobId: string) {
    const running = await this.prisma.companyImportPartition.findFirst({
      where: { jobId, status: CompanyImportPartitionStatus.RUNNING },
      orderBy: { sortOrder: 'asc' },
    });
    if (running) return running;

    return this.prisma.companyImportPartition.findFirst({
      where: { jobId, status: CompanyImportPartitionStatus.PENDING },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getProgressStats(jobId: string) {
    const rows = await this.prisma.companyImportPartition.groupBy({
      by: ['status'],
      where: { jobId },
      _count: { _all: true },
    });
    const counts: Record<string, number> = {};
    let total = 0;
    for (const row of rows) {
      counts[row.status] = row._count._all;
      total += row._count._all;
    }
    const completed = (counts.COMPLETED ?? 0) + (counts.SPLIT ?? 0);
    const pending = counts.PENDING ?? 0;
    const running = counts.RUNNING ?? 0;
    const failed = counts.FAILED ?? 0;
    const overallPercent =
      total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return { total, completed, pending, running, failed, overallPercent, counts };
  }

  async splitPartition(
    partitionId: string,
    children: PartitionSpec[],
  ): Promise<void> {
    const parent = await this.prisma.companyImportPartition.findUnique({
      where: { id: partitionId },
    });
    if (!parent) return;

    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: {
        status: CompanyImportPartitionStatus.SPLIT,
        completedAt: new Date(),
      },
    });

    const siblingsAfter = await this.prisma.companyImportPartition.count({
      where: {
        jobId: parent.jobId,
        sortOrder: { gt: parent.sortOrder },
        status: { not: CompanyImportPartitionStatus.SPLIT },
      },
    });

    if (siblingsAfter > 0) {
      await this.prisma.companyImportPartition.updateMany({
        where: {
          jobId: parent.jobId,
          sortOrder: { gt: parent.sortOrder },
        },
        data: { sortOrder: { increment: children.length } },
      });
    }

    await this.prisma.companyImportPartition.createMany({
      data: children.map((child, index) => ({
        jobId: parent.jobId,
        parentId: partitionId,
        sortOrder: parent.sortOrder + index + 1,
        depth: child.depth,
        label: child.label,
        filtersJson: child.filter as Prisma.InputJsonValue,
        status: CompanyImportPartitionStatus.PENDING,
      })),
    });
  }

  async cancelPendingPartitions(jobId: string) {
    await this.prisma.companyImportPartition.updateMany({
      where: {
        jobId,
        status: { in: [CompanyImportPartitionStatus.PENDING, CompanyImportPartitionStatus.RUNNING] },
      },
      data: { status: CompanyImportPartitionStatus.CANCELLED, completedAt: new Date() },
    });
  }

  async syncFromCheckpoint(
    jobId: string,
    specs: PartitionSpec[],
    completedBeforeIndex: number,
  ) {
    const existing = await this.prisma.companyImportPartition.count({ where: { jobId } });
    if (existing > 0) return;

    await this.createInitialPartitions(jobId, specs);
    if (completedBeforeIndex > 0) {
      const rows = await this.prisma.companyImportPartition.findMany({
        where: { jobId },
        orderBy: { sortOrder: 'asc' },
      });
      const toComplete = rows.slice(0, completedBeforeIndex);
      for (const row of toComplete) {
        await this.prisma.companyImportPartition.update({
          where: { id: row.id },
          data: {
            status: CompanyImportPartitionStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    }
  }

  async markPartitionRunning(partitionId: string) {
    await this.prisma.companyImportPartition.update({
      where: { id: partitionId },
      data: { status: CompanyImportPartitionStatus.RUNNING, startedAt: new Date() },
    });
  }

  async completeRunningPartitions(jobId: string) {
    await this.prisma.companyImportPartition.updateMany({
      where: { jobId, status: CompanyImportPartitionStatus.RUNNING },
      data: {
        status: CompanyImportPartitionStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }

  async repairFailedJob(jobId: string) {
    const failed = await this.prisma.companyImportPartition.findMany({
      where: { jobId, status: CompanyImportPartitionStatus.FAILED },
      orderBy: { sortOrder: 'asc' },
    });
    for (const row of failed) {
      await this.prisma.companyImportPartition.update({
        where: { id: row.id },
        data: {
          status: CompanyImportPartitionStatus.PENDING,
          error: null,
          cursor: 0,
        },
      });
    }
    const splitParents = await this.prisma.companyImportPartition.findMany({
      where: { jobId, status: CompanyImportPartitionStatus.SPLIT },
      include: { children: true },
    });
    for (const parent of splitParents) {
      if (parent.children.length === 0) {
        await this.prisma.companyImportPartition.update({
          where: { id: parent.id },
          data: {
            status: CompanyImportPartitionStatus.PENDING,
            cursor: 0,
            error: null,
          },
        });
      }
    }
  }
}
