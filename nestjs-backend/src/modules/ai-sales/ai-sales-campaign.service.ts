import { Injectable, NotFoundException } from '@nestjs/common';
import { AiSalesCampaignStatus, AiSalesPartnerType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiSalesCampaignService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: AiSalesCampaignStatus) {
    return this.prisma.aiSalesCampaign.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { messages: true, leads: true } } },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.aiSalesCampaign.findUnique({
      where: { id },
      include: { _count: { select: { messages: true, leads: true } } },
    });
    if (!row) throw new NotFoundException('Kampaň nenalezena.');
    return row;
  }

  async create(
    data: {
      name: string;
      partnerType?: AiSalesPartnerType;
      description?: string;
      region?: string;
      productOffer?: string;
      dailyLimit?: number;
    },
    userId?: string,
  ) {
    return this.prisma.aiSalesCampaign.create({
      data: {
        name: data.name,
        partnerType: data.partnerType,
        description: data.description,
        region: data.region,
        productOffer: data.productOffer,
        dailyLimit: data.dailyLimit,
        createdById: userId,
      },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      region: string;
      productOffer: string;
      dailyLimit: number;
      status: AiSalesCampaignStatus;
    }>,
  ) {
    await this.getById(id);
    return this.prisma.aiSalesCampaign.update({ where: { id }, data });
  }

  async activate(id: string, userId?: string) {
    return this.prisma.aiSalesCampaign.update({
      where: { id },
      data: {
        status: AiSalesCampaignStatus.ACTIVE,
        approvedById: userId,
        startedAt: new Date(),
      },
    });
  }

  async pause(id: string) {
    return this.prisma.aiSalesCampaign.update({
      where: { id },
      data: { status: AiSalesCampaignStatus.PAUSED },
    });
  }
}
