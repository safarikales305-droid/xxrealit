import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CompanyDirectoryCategory,
  CompanyDirectoryProfileStatus,
  CompanyProfileReportStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BrokersService } from '../brokers/brokers.service';
import { COMPANY_DIRECTORY_ENABLED } from './company-directory.constants';
import {
  buildCompanyListWhere,
  serializeCompanyDirectoryCard,
  serializeCompanyDirectoryDetail,
} from './company-directory.serializer';
import { parseIcoFromCompanySlug } from './company-directory.slug';

export type FeaturedProfileCard = {
  type: 'person' | 'company';
  id: string;
  name: string;
  slug?: string | null;
  role?: string;
  category?: string;
  categoryLabel?: string;
  city?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  isVerified: boolean;
  badges: string[];
  href: string;
};

@Injectable()
export class CompanyDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokersService: BrokersService,
  ) {}

  isEnabled(): boolean {
    return COMPANY_DIRECTORY_ENABLED;
  }

  async listPublic(query: {
    q?: string;
    ico?: string;
    category?: string;
    region?: string;
    city?: string;
    verified?: string;
    active?: string;
    minRating?: string;
    page?: string;
    pageSize?: string;
  }) {
    if (!this.isEnabled()) {
      return { items: [], total: 0, page: 1, pageSize: 24 };
    }

    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 24) || 24));
    const where = buildCompanyListWhere(query);

    const [total, rows] = await Promise.all([
      this.prisma.companyDirectoryEntry.count({ where }),
      this.prisma.companyDirectoryEntry.findMany({
        where,
        orderBy: [
          { verificationStatus: 'desc' },
          { googleReviewCount: 'desc' },
          { name: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: rows.map(serializeCompanyDirectoryCard),
      total,
      page,
      pageSize,
    };
  }

  async getPublicBySlug(slug: string) {
    if (!this.isEnabled()) {
      throw new NotFoundException('Registr firem není aktivní.');
    }

    const icoFromSlug = parseIcoFromCompanySlug(slug);
    const row = await this.prisma.companyDirectoryEntry.findFirst({
      where: {
        publicProfile: true,
        OR: [{ slug }, ...(icoFromSlug ? [{ ico: icoFromSlug }] : [])],
      },
    });
    if (!row) {
      throw new NotFoundException('Firemní profil nebyl nalezen.');
    }

    const similar = await this.prisma.companyDirectoryEntry.findMany({
      where: {
        publicProfile: true,
        id: { not: row.id },
        OR: [
          row.city ? { city: row.city } : {},
          row.categories.length > 0
            ? { categories: { hasSome: row.categories } }
            : {},
        ],
      },
      take: 6,
      orderBy: [{ googleReviewCount: 'desc' }, { name: 'asc' }],
    });

    return {
      company: serializeCompanyDirectoryDetail(row),
      similar: similar.map(serializeCompanyDirectoryCard),
    };
  }

  async getFeaturedProfiles(options?: {
    category?: string;
    limit?: number;
  }): Promise<FeaturedProfileCard[]> {
    const limit = Math.min(24, Math.max(3, options?.limit ?? 12));
    const personLimit = Math.ceil(limit / 2);
    const companyLimit = limit - personLimit;

    const roles = mapCommunityCategoryToRoles(options?.category);
    const professionals = await this.brokersService.listPublicProfessionals(roles);
    const personCards: FeaturedProfileCard[] = professionals.slice(0, personLimit).map((p) => ({
      type: 'person',
      id: p.id,
      name: p.name ?? 'Profesionál',
      slug: p.slug,
      role: p.role,
      categoryLabel: p.role,
      city: p.city,
      rating: p.ratingAverage,
      ratingCount: p.ratingCount,
      avatarUrl: p.avatarUrl,
      isVerified: p.isVerified,
      badges: p.isVerified ? ['OVĚŘENO'] : [],
      href: p.slug ? `/makler/${p.slug}` : `/profile/${p.id}`,
    }));

    let companyCards: FeaturedProfileCard[] = [];
    if (this.isEnabled()) {
      const category = parseDirectoryCategory(options?.category);
      const companies = await this.prisma.companyDirectoryEntry.findMany({
        where: {
          publicProfile: true,
          ...(category ? { categories: { has: category } } : {}),
        },
        orderBy: [
          { profileStatus: 'desc' },
          { verificationStatus: 'desc' },
          { googleReviewCount: 'desc' },
          { updatedAt: 'desc' },
        ],
        take: companyLimit * 2,
      });
      companyCards = companies.slice(0, companyLimit).map((row) => {
        const card = serializeCompanyDirectoryCard(row);
        return {
          type: 'company' as const,
          id: card.id,
          name: card.name,
          slug: card.slug,
          category: card.category,
          categoryLabel: card.categoryLabel,
          city: card.city,
          rating: card.rating,
          ratingCount: card.ratingCount,
          logoUrl: card.logoUrl,
          isVerified: card.isVerified,
          badges: card.badges,
          href: card.href,
        };
      });
    }

    return interleaveProfiles(personCards, companyCards).slice(0, limit);
  }

  async createProfileReport(input: {
    companyId: string;
    reporterUserId?: string;
    reason: string;
  }) {
    return this.prisma.companyProfileReport.create({
      data: {
        companyId: input.companyId,
        reporterUserId: input.reporterUserId ?? null,
        reason: input.reason.trim(),
        status: CompanyProfileReportStatus.REQUESTED,
      },
    });
  }

  async getAdminDashboard() {
    const [
      total,
      aresCount,
      claimed,
      verified,
      googleLinked,
      withRating,
      withoutRating,
      pendingContact,
      pendingClaims,
      pendingReports,
    ] = await Promise.all([
      this.prisma.companyDirectoryEntry.count(),
      this.prisma.companyDirectoryEntry.count({ where: { aresSource: true } }),
      this.prisma.companyDirectoryEntry.count({
        where: { profileStatus: { in: [CompanyDirectoryProfileStatus.CLAIMED, CompanyDirectoryProfileStatus.VERIFIED] } },
      }),
      this.prisma.companyDirectoryEntry.count({ where: { verificationStatus: 'VERIFIED' } }),
      this.prisma.companyDirectoryEntry.count({ where: { googlePlaceId: { not: null } } }),
      this.prisma.companyDirectoryEntry.count({ where: { googleRating: { not: null } } }),
      this.prisma.companyDirectoryEntry.count({ where: { googleRating: null } }),
      this.prisma.companyDirectoryEntry.count({
        where: { OR: [{ email: null }, { phone: null }] },
      }),
      this.prisma.companyClaimRequest.count({ where: { status: { in: ['PENDING', 'UNDER_REVIEW'] } } }),
      this.prisma.companyProfileReport.count({ where: { status: { in: ['REQUESTED', 'UNDER_REVIEW'] } } }),
    ]);

    return {
      total,
      aresCount,
      claimed,
      verified,
      googleLinked,
      withRating,
      withoutRating,
      pendingContact,
      pendingClaims,
      pendingReports,
    };
  }
}

function mapCommunityCategoryToRoles(category?: string): string | undefined {
  switch ((category ?? '').toUpperCase()) {
    case 'MAKLERI':
      return 'AGENT';
    case 'STAVEBNI_FIRMY':
      return 'COMPANY';
    case 'REALITNI_KANCELARE':
      return 'AGENCY';
    case 'FINANCNI_PORADCI':
      return 'FINANCIAL_ADVISOR';
    case 'INVESTORI':
      return 'INVESTOR';
    case 'PRACOVNICI_PORTALU':
      return 'PORTAL_WORKER';
  }
  return 'AGENT,AGENCY,COMPANY,FINANCIAL_ADVISOR,INVESTOR,PORTAL_WORKER';
}

function parseDirectoryCategory(
  raw?: string,
): CompanyDirectoryCategory | null {
  if (!raw) return null;
  const map: Record<string, CompanyDirectoryCategory> = {
    STAVEBNI_FIRMY: CompanyDirectoryCategory.STAVEBNICTVI,
    REALITNI_KANCELARE: CompanyDirectoryCategory.REALITY,
    FINANCNI_PORADCI: CompanyDirectoryCategory.FINANCE,
    DEVELOPERI: CompanyDirectoryCategory.DEVELOPMENT,
    PROJEKTANTI: CompanyDirectoryCategory.PROJEKTOVANI,
    ARCHITEKTI: CompanyDirectoryCategory.ARCHITEKTURA,
    REMESLNIKI: CompanyDirectoryCategory.REMESLA,
  };
  return map[raw.toUpperCase()] ?? null;
}

function interleaveProfiles(
  persons: FeaturedProfileCard[],
  companies: FeaturedProfileCard[],
): FeaturedProfileCard[] {
  const out: FeaturedProfileCard[] = [];
  const max = Math.max(persons.length, companies.length);
  for (let i = 0; i < max; i += 1) {
    if (persons[i]) out.push(persons[i]);
    if (companies[i]) out.push(companies[i]);
  }
  return out;
}
