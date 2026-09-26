import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiRenovationMaterialTier,
  AiRenovationRecipientStatus,
  AiVisualizationEventName,
  CompanyDirectoryCategory,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OpenAiService } from '../openai/openai.service';
import { EmailsService } from '../emails/emails.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { createPublicShareId } from './ai-visualization-id.util';
import { RenovationPricingService } from './renovation-pricing.service';
import type { RenovationLineItem } from './renovation-pricing.defaults';
import { AiVisualizationService } from './ai-visualization.service';

const TRANSFER_CONSENT_TEXT =
  'Souhlasím s předáním údajů vybraným stavebním firmám za účelem vyřízení této poptávky.';

@Injectable()
export class AiRenovationService {
  private readonly inFlightSend = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: RenovationPricingService,
    private readonly openAi: OpenAiService,
    private readonly emails: EmailsService,
    private readonly viz: AiVisualizationService,
  ) {}

  async createEstimate(input: {
    visualizationId: string;
    anonymousSessionId: string;
    userId?: string | null;
    location?: string;
    areaSqm?: number;
    scopePartial?: boolean;
    materialTier?: AiRenovationMaterialTier;
  }) {
    const viz = await this.assertVizAccess(input.visualizationId, input.anonymousSessionId, input.userId);
    if (viz.status !== 'COMPLETED') throw new BadRequestException('Nejdřív dokončete vizualizaci.');

    const areaSqm = input.areaSqm ?? this.defaultArea(viz.propertyType);
    const materialTier = input.materialTier ?? 'STANDARD';
    const region = input.location?.trim() || 'CZ';
    const scopePartial = input.scopePartial ?? false;
    const renovationLevel = viz.renovationLevel ?? 'RENOVATION';

    await this.viz.trackEvent({
      eventName: 'ai_visualization_estimate_start' as AiVisualizationEventName,
      visualizationId: viz.id,
      userId: input.userId,
      anonymousSessionId: input.anonymousSessionId,
    });

    const baseline = this.pricing.computeDeterministicEstimate({
      propertyType: viz.propertyType ?? 'other',
      areaSqm,
      renovationLevel,
      materialTier,
      scopePartial,
      region,
    });

    let aiLines: RenovationLineItem[] | null = null;
    try {
      const aiRes = await this.openAi.complete({
        feature: 'ai_chat',
        jsonMode: true,
        salesOperation: true,
        systemPrompt:
          'Return JSON only: {"lineItems":[{"id":"string","label":"string","amountMin":number,"amountMax":number}]}. Realistic CZK ranges for Czech renovation.',
        userPrompt: JSON.stringify({
          baseline,
          propertyType: viz.propertyType,
          style: viz.style,
          renovationLevel,
          userPrompt: viz.userPrompt,
          location: region,
          areaSqm,
          materialTier,
          pricingContext: this.pricing.getBaselineContextForAi(region),
        }),
      });
      const parsed = JSON.parse(aiRes.text) as { lineItems?: RenovationLineItem[] };
      aiLines = parsed.lineItems ?? null;
    } catch {
      aiLines = null;
    }

    const snapshot = this.pricing.mergeAiLineItems(baseline, aiLines);

    const row = await this.prisma.aiRenovationEstimate.upsert({
      where: { visualizationId: viz.id },
      create: {
        visualizationId: viz.id,
        userId: input.userId ?? undefined,
        anonymousSessionId: input.anonymousSessionId,
        location: region,
        areaSqm,
        scopePartial,
        materialTier,
        lineItemsJson: snapshot.lineItems as unknown as Prisma.InputJsonValue,
        estimateMin: snapshot.estimateMin,
        estimateMax: snapshot.estimateMax,
        reserveMin: snapshot.reserveMin,
        reserveMax: snapshot.reserveMax,
        totalMinWithReserve: snapshot.totalMinWithReserve,
        totalMaxWithReserve: snapshot.totalMaxWithReserve,
        pricingVersion: snapshot.pricingVersion,
        region,
      },
      update: {
        location: region,
        areaSqm,
        scopePartial,
        materialTier,
        lineItemsJson: snapshot.lineItems as unknown as Prisma.InputJsonValue,
        estimateMin: snapshot.estimateMin,
        estimateMax: snapshot.estimateMax,
        reserveMin: snapshot.reserveMin,
        reserveMax: snapshot.reserveMax,
        totalMinWithReserve: snapshot.totalMinWithReserve,
        totalMaxWithReserve: snapshot.totalMaxWithReserve,
        pricingVersion: snapshot.pricingVersion,
        region,
        calculatedAt: new Date(),
      },
    });

    await this.viz.trackEvent({
      eventName: 'ai_visualization_estimate_complete' as AiVisualizationEventName,
      visualizationId: viz.id,
      userId: input.userId,
      anonymousSessionId: input.anonymousSessionId,
      meta: { estimateId: row.id },
    });

    return this.serializeEstimate(row);
  }

  async createProjectEstimate(input: {
    primaryVisualizationId: string;
    anonymousSessionId: string;
    userId?: string | null;
    location?: string;
    areaSqm?: number;
    scopePartial?: boolean;
    materialTier?: AiRenovationMaterialTier;
  }) {
    const primary = await this.assertVizAccess(
      input.primaryVisualizationId,
      input.anonymousSessionId,
      input.userId,
    );
    const rows = await this.prisma.aiVisualization.findMany({
      where: {
        anonymousSessionId: input.anonymousSessionId,
        status: 'COMPLETED',
        ...(input.userId ? { OR: [{ userId: null }, { userId: input.userId }] } : { userId: null }),
      },
      orderBy: { createdAt: 'desc' },
    });
    const roots = new Map<string, (typeof rows)[0]>();
    for (const row of rows) {
      const rootId = row.parentId ?? row.id;
      if (!roots.has(rootId)) roots.set(rootId, row);
    }
    if (roots.size === 0) throw new BadRequestException('Nejdřív dokončete alespoň jednu vizualizaci.');

    const materialTier = input.materialTier ?? 'STANDARD';
    const region = input.location?.trim() || 'CZ';
    const scopePartial = input.scopePartial ?? false;

    const mergedMap = new Map<string, RenovationLineItem>();
    let estimateMin = 0;
    let estimateMax = 0;
    let pricingVersion = this.pricing.version;

    for (const viz of roots.values()) {
      const areaSqm = input.areaSqm ?? this.defaultArea(viz.propertyType);
      const renovationLevel = viz.renovationLevel ?? 'RENOVATION';
      const snap = this.pricing.computeDeterministicEstimate({
        propertyType: viz.propertyType ?? 'other',
        areaSqm,
        renovationLevel,
        materialTier,
        scopePartial,
        region,
      });
      pricingVersion = snap.pricingVersion;
      estimateMin += snap.estimateMin;
      estimateMax += snap.estimateMax;
      for (const line of snap.lineItems) {
        const prev = mergedMap.get(line.id);
        if (!prev) mergedMap.set(line.id, { ...line });
        else {
          mergedMap.set(line.id, {
            ...prev,
            label: prev.label,
            amountMin: prev.amountMin + line.amountMin,
            amountMax: prev.amountMax + line.amountMax,
          });
        }
      }
    }

    const lineItems = [...mergedMap.values()];
    const reserveMin = Math.round(estimateMin * 0.1);
    const reserveMax = Math.round(estimateMax * 0.1);

    await this.viz.trackEvent({
      eventName: 'ai_visualization_estimate_start' as AiVisualizationEventName,
      visualizationId: primary.id,
      userId: input.userId,
      anonymousSessionId: input.anonymousSessionId,
      meta: { projectParts: roots.size },
    });

    const row = await this.prisma.aiRenovationEstimate.upsert({
      where: { visualizationId: primary.id },
      create: {
        visualizationId: primary.id,
        userId: input.userId ?? undefined,
        anonymousSessionId: input.anonymousSessionId,
        location: region,
        areaSqm: input.areaSqm,
        scopePartial,
        materialTier,
        lineItemsJson: lineItems as unknown as Prisma.InputJsonValue,
        estimateMin,
        estimateMax,
        reserveMin,
        reserveMax,
        totalMinWithReserve: estimateMin + reserveMin,
        totalMaxWithReserve: estimateMax + reserveMax,
        pricingVersion,
        region,
      },
      update: {
        location: region,
        areaSqm: input.areaSqm,
        scopePartial,
        materialTier,
        lineItemsJson: lineItems as unknown as Prisma.InputJsonValue,
        estimateMin,
        estimateMax,
        reserveMin,
        reserveMax,
        totalMinWithReserve: estimateMin + reserveMin,
        totalMaxWithReserve: estimateMax + reserveMax,
        pricingVersion,
        region,
        calculatedAt: new Date(),
      },
    });

    await this.viz.trackEvent({
      eventName: 'ai_visualization_estimate_complete' as AiVisualizationEventName,
      visualizationId: primary.id,
      userId: input.userId,
      anonymousSessionId: input.anonymousSessionId,
      meta: { estimateId: row.id, projectParts: roots.size },
    });

    return this.serializeEstimate(row);
  }

  async findCompanies(input: { location?: string; visualizationId: string; limit?: number }) {
    const take = Math.min(30, input.limit ?? 12);
    const city = input.location?.trim();
    const categories: CompanyDirectoryCategory[] = [
      CompanyDirectoryCategory.STAVEBNICTVI,
      CompanyDirectoryCategory.REMESLA,
      CompanyDirectoryCategory.PROJEKTOVANI,
    ];

    const where: Prisma.CompanyDirectoryEntryWhereInput = {
      publicProfile: true,
      hidden: false,
      inactive: false,
      dissolved: false,
      categories: { hasSome: categories },
      ...(city
        ? {
            OR: [
              { city: { contains: city, mode: 'insensitive' } },
              { region: { contains: city, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.companyDirectoryEntry.findMany({
      where,
      orderBy: [{ verificationStatus: 'desc' }, { googleReviewCount: 'desc' }, { name: 'asc' }],
      take,
      select: { id: true, name: true, slug: true, city: true, region: true, categories: true },
    });

    await this.viz.trackEvent({
      eventName: 'renovation_companies_viewed' as AiVisualizationEventName,
      visualizationId: input.visualizationId,
      meta: { count: rows.length },
    });

    return { items: rows };
  }

  async createAndSendRequest(input: {
    visualizationId: string;
    estimateId: string;
    anonymousSessionId: string;
    userId?: string | null;
    userEmail?: string | null;
    userName?: string | null;
    email?: string;
    phone?: string;
    companyIds: string[];
    transferConsent: boolean;
    marketingConsent?: boolean;
    idempotencyKey: string;
    description?: string;
  }) {
    if (!input.transferConsent) {
      throw new BadRequestException('Je vyžadován souhlas s předáním údajů firmám.');
    }
    if (this.inFlightSend.has(input.idempotencyKey)) {
      throw new BadRequestException('Poptávka se právě odesílá.');
    }

    const existing = await this.prisma.aiRenovationRequest.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) return this.serializeRequest(existing.id);

    this.inFlightSend.add(input.idempotencyKey);
    try {
      const viz = await this.assertVizAccess(input.visualizationId, input.anonymousSessionId, input.userId);
      const estimate = await this.prisma.aiRenovationEstimate.findFirst({
        where: { id: input.estimateId, visualizationId: viz.id },
      });
      if (!estimate) throw new NotFoundException('Odhad nenalezen.');

      let userEmail = input.userEmail?.trim();
      let userName = input.userName;
      if (input.userId && !userEmail) {
        const u = await this.prisma.user.findUnique({
          where: { id: input.userId },
          select: { email: true, name: true },
        });
        userEmail = u?.email ?? undefined;
        userName = userName ?? u?.name ?? undefined;
      }

      const email = (input.userId ? userEmail : input.email)?.trim().toLowerCase();
      if (!email || !email.includes('@')) throw new BadRequestException('Zadejte platný e-mail.');

      if (!input.userId) {
        await this.viz.trackEvent({
          eventName: 'renovation_lead_email_entered' as AiVisualizationEventName,
          visualizationId: viz.id,
          anonymousSessionId: input.anonymousSessionId,
        });
      }

      const companyIds = [...new Set(input.companyIds)].slice(0, 15);
      if (companyIds.length === 0) throw new BadRequestException('Vyberte alespoň jednu firmu.');

      const publicId = createPublicShareId();
      const request = await this.prisma.aiRenovationRequest.create({
        data: {
          publicId,
          visualizationId: viz.id,
          estimateId: estimate.id,
          userId: input.userId ?? undefined,
          email,
          name: input.userName ?? undefined,
          phone: input.phone,
          location: estimate.location,
          description: input.description,
          budgetMin: estimate.estimateMin,
          budgetMax: estimate.estimateMax,
          transferConsentAt: new Date(),
          transferConsentText: TRANSFER_CONSENT_TEXT,
          marketingConsent: input.marketingConsent === true,
          marketingConsentAt: input.marketingConsent ? new Date() : undefined,
          status: 'NEW',
          idempotencyKey: input.idempotencyKey,
          recipients: {
            create: companyIds.map((companyId) => ({ companyId, status: 'PENDING' })),
          },
        },
      });

      await this.viz.trackEvent({
        eventName: 'renovation_request_created' as AiVisualizationEventName,
        visualizationId: viz.id,
        userId: input.userId,
        anonymousSessionId: input.anonymousSessionId,
        meta: { requestId: request.id },
      });

      await this.notifyCompanies(request.id);
      const updated = await this.prisma.aiRenovationRequest.update({
        where: { id: request.id },
        data: { status: 'SENT' },
      });

      await this.viz.trackEvent({
        eventName: 'renovation_request_sent' as AiVisualizationEventName,
        visualizationId: viz.id,
        userId: input.userId,
        meta: { requestId: request.id, companies: companyIds.length },
      });

      return this.serializeRequest(updated.id);
    } finally {
      this.inFlightSend.delete(input.idempotencyKey);
    }
  }

  async getPublicRequest(publicId: string, viewerUserId?: string | null) {
    const row = await this.prisma.aiRenovationRequest.findUnique({
      where: { publicId },
      include: {
        estimate: true,
        visualization: true,
        recipients: { include: { company: { select: { id: true, name: true, slug: true, claimedByUserId: true } } } },
      },
    });
    if (!row) throw new NotFoundException();

    const isOwner = viewerUserId && row.userId === viewerUserId;
    const isCompanyViewer =
      viewerUserId != null &&
      row.recipients.some((r) => r.company.claimedByUserId === viewerUserId);
    const lineItems = row.estimate.lineItemsJson as RenovationLineItem[];

    return {
      publicId: row.publicId,
      status: row.status,
      location: row.location,
      description: row.description,
      budgetMin: row.budgetMin,
      budgetMax: row.budgetMax,
      areaSqm: row.estimate.areaSqm,
      scopePartial: row.estimate.scopePartial,
      materialTier: row.estimate.materialTier,
      propertyType: row.visualization.propertyType,
      style: row.visualization.style,
      renovationLevel: row.visualization.renovationLevel,
      userPrompt: row.visualization.userPrompt,
      originalPreviewUrl: row.visualization.originalPreviewUrl,
      resultPreviewUrl: row.visualization.resultPreviewUrl,
      lineItems,
      pricingVersion: row.estimate.pricingVersion,
      calculatedAt: row.estimate.calculatedAt.toISOString(),
      contactEmail: isOwner || isCompanyViewer ? row.email : undefined,
      recipients: row.recipients.map((r) => ({
        id: r.id,
        companyId: r.companyId,
        companyName: r.company.name,
        status: r.status,
        offerPrice: r.offerPrice,
        canRespond: viewerUserId != null && r.company.claimedByUserId === viewerUserId,
      })),
    };
  }

  async respondAsCompany(input: {
    publicId: string;
    companyId: string;
    userId: string;
    status: AiRenovationRecipientStatus;
    offerPrice?: number;
    offerMessage?: string;
  }) {
    const request = await this.prisma.aiRenovationRequest.findUnique({ where: { publicId: input.publicId } });
    if (!request) throw new NotFoundException();

    const company = await this.prisma.companyDirectoryEntry.findUnique({ where: { id: input.companyId } });
    if (!company || company.claimedByUserId !== input.userId) {
      throw new ForbiddenException('Nemáte oprávnění reagovat za tuto firmu.');
    }

    const recipient = await this.prisma.aiRenovationRequestRecipient.findUnique({
      where: { requestId_companyId: { requestId: request.id, companyId: input.companyId } },
    });
    if (!recipient) throw new NotFoundException('Poptávka pro firmu nenalezena.');

    await this.prisma.aiRenovationRequestRecipient.update({
      where: { id: recipient.id },
      data: {
        status: input.status,
        offerPrice: input.offerPrice,
        offerMessage: input.offerMessage,
        respondedAt: new Date(),
      },
    });

    await this.viz.trackEvent({
      eventName:
        input.status === 'OFFER_SENT'
          ? ('renovation_offer_received' as AiVisualizationEventName)
          : ('renovation_company_response' as AiVisualizationEventName),
      meta: { requestId: request.id, companyId: input.companyId },
    });

    await this.prisma.aiRenovationRequest.update({
      where: { id: request.id },
      data: { status: 'COMPANIES_RESPONDING' },
    });

    return { ok: true };
  }

  async listAdminRequests(limit = 50) {
    const rows = await this.prisma.aiRenovationRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: { select: { recipients: true } },
        estimate: true,
        visualization: { select: { propertyType: true } },
        recipients: { select: { status: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        publicId: r.publicId,
        email: r.email,
        userId: r.userId,
        location: r.location,
        propertyType: r.visualization.propertyType,
        status: r.status,
        budgetMin: r.budgetMin,
        budgetMax: r.budgetMax,
        companiesCount: r._count.recipients,
        responsesCount: r.recipients.filter(
          (x) => x.status !== 'PENDING' && x.status !== 'NOTIFIED',
        ).length,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private async notifyCompanies(requestId: string) {
    const row = await this.prisma.aiRenovationRequest.findUnique({
      where: { id: requestId },
      include: {
        visualization: true,
        recipients: { include: { company: true } },
      },
    });
    if (!row) return;

    const link = `${resolveFrontendUrl()}/poptavka/${row.publicId}`;
    for (const rec of row.recipients) {
      const to = rec.company.email?.trim();
      if (!to) continue;
      const body = [
        'NOVÁ POPTÁVKA Z XXREALIT',
        '',
        `Typ: ${row.visualization.propertyType ?? 'rekonstrukce'}`,
        `Lokalita: ${row.location ?? '—'}`,
        `AI orientační rozpočet: ${row.budgetMin ?? '—'} – ${row.budgetMax ?? '—'} Kč`,
        '',
        `Detail: ${link}`,
      ].join('\n');

      try {
        await this.emails.sendTemplatedEmail({
          type: 'company_outreach',
          to,
          templateKey: 'custom_message',
          variables: {
            subject: 'Nová poptávka rekonstrukce z XXREALIT',
            bodyHtml: body.replace(/\n/g, '<br/>'),
            bodyText: body,
            message: body,
            portalName: 'XXREALIT',
            companyName: rec.company.name,
          },
        });
        await this.prisma.aiRenovationRequestRecipient.update({
          where: { id: rec.id },
          data: { status: 'NOTIFIED', notifiedAt: new Date() },
        });
      } catch {
        /* ignore single failure */
      }
    }
  }

  private async assertVizAccess(id: string, anonymousSessionId: string, userId?: string | null) {
    const viz = await this.prisma.aiVisualization.findUnique({ where: { id } });
    if (!viz) throw new NotFoundException();
    if (viz.userId) {
      if (!userId || viz.userId !== userId) throw new ForbiddenException();
    } else if (viz.anonymousSessionId !== anonymousSessionId) {
      throw new ForbiddenException();
    }
    return viz;
  }

  private defaultArea(propertyType: string | null | undefined): number {
    if (propertyType === 'bathroom') return 8;
    if (propertyType === 'kitchen') return 14;
    if (propertyType === 'exterior' || propertyType === 'garden') return 120;
    if (propertyType === 'apartment') return 65;
    return 24;
  }

  private serializeEstimate(row: {
    id: string;
    visualizationId: string;
    location: string | null;
    areaSqm: number | null;
    scopePartial: boolean;
    materialTier: AiRenovationMaterialTier;
    lineItemsJson: unknown;
    estimateMin: number;
    estimateMax: number;
    reserveMin: number | null;
    reserveMax: number | null;
    totalMinWithReserve: number | null;
    totalMaxWithReserve: number | null;
    pricingVersion: string;
    region: string | null;
    calculatedAt: Date;
  }) {
    return {
      id: row.id,
      visualizationId: row.visualizationId,
      location: row.location,
      areaSqm: row.areaSqm,
      scopePartial: row.scopePartial,
      materialTier: row.materialTier,
      lineItems: row.lineItemsJson,
      estimateMin: row.estimateMin,
      estimateMax: row.estimateMax,
      reserveMin: row.reserveMin,
      reserveMax: row.reserveMax,
      totalMinWithReserve: row.totalMinWithReserve,
      totalMaxWithReserve: row.totalMaxWithReserve,
      pricingVersion: row.pricingVersion,
      region: row.region,
      calculatedAt: row.calculatedAt.toISOString(),
    };
  }

  private async serializeRequest(id: string) {
    const row = await this.prisma.aiRenovationRequest.findUnique({
      where: { id },
      include: { _count: { select: { recipients: true } } },
    });
    if (!row) throw new NotFoundException();
    return {
      id: row.id,
      publicId: row.publicId,
      status: row.status,
      companiesCount: row._count.recipients,
      poptavkaUrl: `/poptavka/${row.publicId}`,
    };
  }
}
