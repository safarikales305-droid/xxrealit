import { Injectable, NotFoundException } from '@nestjs/common';
import { AiSalesProspectStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiSalesCrmService {
  constructor(private readonly prisma: PrismaService) {}

  async listPartners(filters?: { status?: AiSalesProspectStatus; q?: string; limit?: number }) {
    const where: Prisma.AiSalesProspectWhereInput = {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.q
        ? {
            OR: [
              { companyName: { contains: filters.q, mode: 'insensitive' } },
              { email: { contains: filters.q, mode: 'insensitive' } },
              { city: { contains: filters.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.aiSalesProspect.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { fitScore: 'desc' }, { updatedAt: 'desc' }],
      take: Math.min(filters?.limit ?? 100, 200),
      include: {
        _count: { select: { messages: true, tasks: true, memories: true, leads: true } },
      },
    });
  }

  async getPartnerCard(prospectId: string) {
    const prospect = await this.prisma.aiSalesProspect.findUnique({
      where: { id: prospectId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 50 },
        tasks: { orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], take: 30 },
        memories: { orderBy: { createdAt: 'desc' }, take: 50 },
        leads: { orderBy: { createdAt: 'desc' }, take: 20 },
        publicContacts: { orderBy: [{ isPrimary: 'desc' }, { confidence: 'desc' }] },
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
      },
    });
    if (!prospect) throw new NotFoundException('Partner nenalezen.');

    const replyAnalyses = await this.prisma.aiSalesReplyAnalysis.findMany({
      where: { message: { prospectId } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { message: { select: { id: true, subject: true, sentAt: true } } },
    });

    return { ...prospect, replyAnalyses };
  }

  async updatePartnerCrm(
    prospectId: string,
    patch: {
      notes?: string;
      nextActionAt?: string | null;
      status?: AiSalesProspectStatus;
      assignedToId?: string | null;
    },
  ) {
    await this.getPartnerCard(prospectId);
    return this.prisma.aiSalesProspect.update({
      where: { id: prospectId },
      data: {
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
        ...(patch.nextActionAt !== undefined
          ? { nextActionAt: patch.nextActionAt ? new Date(patch.nextActionAt) : null }
          : {}),
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.assignedToId !== undefined ? { assignedToId: patch.assignedToId } : {}),
      },
    });
  }

  async addMemory(
    prospectId: string,
    input: { memoryType: string; content: string; source?: string; sourceId?: string },
    userId?: string,
  ) {
    await this.getPartnerCard(prospectId);
    return this.prisma.aiSalesPartnerMemory.create({
      data: {
        prospectId,
        memoryType: input.memoryType,
        content: input.content,
        source: input.source ?? 'MANUAL',
        sourceId: input.sourceId,
        createdById: userId,
      },
    });
  }

  async deleteMemory(memoryId: string) {
    return this.prisma.aiSalesPartnerMemory.delete({ where: { id: memoryId } });
  }
}
