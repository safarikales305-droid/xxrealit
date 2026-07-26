import { Injectable } from '@nestjs/common';
import { AiSalesMessageStatus, AiSalesProspectStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiSalesDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(periodDays = 7) {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      newProspects,
      analyzedProspects,
      needsReview,
      approvedProspects,
      pendingApproval,
      sentToday,
      repliesToday,
      positiveReplies,
      rejections,
      noResponse,
      scheduledFollowUps,
      conversions,
      activePartners,
      leads,
      aiUsage,
      foundInSearch,
      newAgencies,
      newAgents,
      newConstruction,
    ] = await Promise.all([
      this.prisma.aiSalesProspect.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aiSalesProspect.count({
        where: { analysisStatus: 'COMPLETED', analyzedAt: { gte: since } },
      }),
      this.prisma.aiSalesProspect.count({ where: { status: AiSalesProspectStatus.NEEDS_REVIEW } }),
      this.prisma.aiSalesProspect.count({ where: { status: AiSalesProspectStatus.APPROVED } }),
      this.prisma.aiSalesMessage.count({ where: { status: AiSalesMessageStatus.PENDING_APPROVAL } }),
      this.prisma.aiSalesMessage.count({
        where: { sentAt: { gte: todayStart }, status: AiSalesMessageStatus.SENT },
      }),
      this.prisma.aiSalesMessage.count({
        where: { repliedAt: { gte: todayStart } },
      }),
      this.prisma.aiSalesReplyAnalysis.count({
        where: {
          classification: { in: ['INTERESTED', 'WANTS_CALL', 'WANTS_MEETING', 'REQUEST_MORE_INFO'] },
          createdAt: { gte: since },
        },
      }),
      this.prisma.aiSalesReplyAnalysis.count({
        where: {
          classification: { in: ['NOT_INTERESTED', 'UNSUBSCRIBE'] },
          createdAt: { gte: since },
        },
      }),
      this.prisma.aiSalesMessage.count({
        where: {
          status: AiSalesMessageStatus.SENT,
          repliedAt: null,
          sentAt: { lte: new Date(Date.now() - 3 * 86400000) },
        },
      }),
      this.prisma.aiSalesTask.count({
        where: { status: 'PENDING', dueAt: { gte: new Date() } },
      }),
      this.prisma.aiSalesProspect.count({
        where: { status: AiSalesProspectStatus.CONVERTED, updatedAt: { gte: since } },
      }),
      this.prisma.aiSalesProspect.count({
        where: { status: AiSalesProspectStatus.ACTIVE_PARTNER },
      }),
      this.prisma.aiSalesLead.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aiUsageLog.aggregate({
        where: { feature: 'ai_sales', createdAt: { gte: since }, success: true },
        _sum: { estimatedCostCzk: true, totalTokens: true },
        _count: true,
      }),
      this.prisma.aiSalesSearchResult.count({ where: { createdAt: { gte: since } } }),
      this.prisma.aiSalesProspect.count({
        where: { partnerType: 'REAL_ESTATE_AGENCY', createdAt: { gte: since } },
      }),
      this.prisma.aiSalesProspect.count({
        where: { partnerType: 'REAL_ESTATE_AGENT', createdAt: { gte: since } },
      }),
      this.prisma.aiSalesProspect.count({
        where: { partnerType: 'CONSTRUCTION_COMPANY', createdAt: { gte: since } },
      }),
    ]);

    const contacted = await this.prisma.aiSalesMessage.count({
      where: { status: AiSalesMessageStatus.SENT, sentAt: { gte: since } },
    });

    const conversionRate = contacted > 0 ? Math.round((conversions / contacted) * 100) : 0;
    const costPerLead = leads > 0 ? Math.round((aiUsage._sum.estimatedCostCzk ?? 0) / leads) : 0;

    const avgFit = await this.prisma.aiSalesProspect.aggregate({
      where: { fitScore: { not: null }, analyzedAt: { gte: since } },
      _avg: { fitScore: true },
    });

    return {
      periodDays,
      newProspects,
      analyzedProspects,
      avgFitScore: Math.round(avgFit._avg.fitScore ?? 0),
      needsReview,
      approvedProspects,
      pendingApproval,
      sentToday,
      repliesToday,
      positiveReplies,
      rejections,
      noResponse,
      scheduledFollowUps,
      conversions,
      activePartners,
      leads,
      foundInSearch,
      newAgencies,
      newAgents,
      newConstruction,
      conversionRate,
      aiCostCzk: aiUsage._sum.estimatedCostCzk ?? 0,
      aiRequests: aiUsage._count,
      costPerLead,
    };
  }

  async getAnalytics(periodDays = 30) {
    const since = new Date();
    since.setDate(since.getDate() - periodDays);

    const byPartnerType = await this.prisma.aiSalesProspect.groupBy({
      by: ['partnerType'],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    const byCampaign = await this.prisma.aiSalesLead.groupBy({
      by: ['campaignId'],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    const objections = await this.prisma.aiSalesReplyAnalysis.groupBy({
      by: ['classification'],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    return { byPartnerType, byCampaign, objections, periodDays };
  }

  async listTasks(limit = 50) {
    return this.prisma.aiSalesTask.findMany({
      where: { status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        prospect: { select: { id: true, companyName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });
  }
}
