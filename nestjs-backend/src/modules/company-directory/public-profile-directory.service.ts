import { Injectable } from '@nestjs/common';
import { CompanyDirectoryCategory, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { BrokersService } from '../brokers/brokers.service';
import { isUserPublicProfileEnabled } from '../../common/user-public-profile.util';
import { CATEGORY_LABELS } from './company-directory.constants';
import { serializeCompanyDirectoryCard } from './company-directory.serializer';
import { COMPANY_DIRECTORY_ENABLED } from './company-directory.constants';
import { professionalRoleLabel } from '../professional-verification/professional-verification-sync.util';

export type PublicProfileDirectoryItem = {
  type: 'USER' | 'COMPANY';
  id: string;
  slug: string | null;
  displayName: string;
  avatarUrl: string | null;
  logoUrl: string | null;
  category: string;
  categoryLabel: string;
  city: string | null;
  region: string | null;
  rating: number | null;
  reviewCount: number | null;
  verified: boolean;
  claimed: boolean;
  source: string;
  profileUrl: string;
  badges: string[];
  active: boolean;
  postCount?: number;
};

export type PublicProfileDirectoryFilter =
  | 'all'
  | 'people'
  | 'companies'
  | 'agents'
  | 'STAVEBNICTVI'
  | 'REALITY'
  | 'FINANCE'
  | 'DEVELOPMENT'
  | 'PROJEKTOVANI'
  | 'ARCHITEKTURA'
  | 'OTHER';

const AGENT_ROLES = new Set<UserRole>([
  UserRole.AGENT,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
  UserRole.PORTAL_WORKER,
  UserRole.CRAFTSMAN,
  UserRole.COMPANY,
]);

@Injectable()
export class PublicProfileDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokers: BrokersService,
  ) {}

  async getStats() {
    const [companies, professionals, publicUsers, regions, categories] = await Promise.all([
      COMPANY_DIRECTORY_ENABLED
        ? this.prisma.companyDirectoryEntry.count({ where: { publicProfile: true } })
        : Promise.resolve(0),
      this.countProfessionals(),
      this.prisma.user.count({
        where: {
          role: UserRole.USER,
          publicProfile: true,
          accountLimited: { not: true },
        },
      }),
      COMPANY_DIRECTORY_ENABLED
        ? this.prisma.companyDirectoryEntry.groupBy({
            by: ['region'],
            where: { publicProfile: true, region: { not: null } },
            _count: { _all: true },
          })
        : Promise.resolve([] as Array<{ region: string | null }>),
      COMPANY_DIRECTORY_ENABLED
        ? this.prisma.companyDirectoryEntry.findMany({
            where: { publicProfile: true },
            select: { categories: true },
            take: 5000,
          })
        : Promise.resolve([]),
    ]);

    const categorySet = new Set<string>();
    for (const row of categories) {
      for (const c of row.categories) categorySet.add(c);
    }

    const regionCount = regions.filter((r) => r.region?.trim()).length;

    return {
      totalPublicProfiles: companies + professionals + publicUsers,
      companies,
      professionals,
      publicUsers,
      categories: categorySet.size,
      regions: regionCount,
    };
  }

  async list(query: {
    q?: string;
    filter?: string;
    region?: string;
    city?: string;
    page?: string;
    pageSize?: string;
    seed?: string;
  }) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(48, Math.max(1, Number(query.pageSize ?? 24) || 24));
    const filter = normalizeFilter(query.filter);
    const q = query.q?.trim().toLowerCase() ?? '';
    const region = query.region?.trim() ?? '';
    const city = query.city?.trim().toLowerCase() ?? '';
    const seed = query.seed?.trim() || dailySeed();

    const all = await this.collectItems(filter);
    const filtered = all.filter((item) => {
      if (region && !(item.region ?? '').toLowerCase().includes(region.toLowerCase())) {
        return false;
      }
      if (city && !(item.city ?? '').toLowerCase().includes(city)) {
        return false;
      }
      if (q) {
        const hay = `${item.displayName} ${item.categoryLabel} ${item.city ?? ''} ${item.region ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const sorted = this.sortItems(filtered, seed);
    const total = sorted.length;
    const items = sorted.slice((page - 1) * pageSize, page * pageSize);

    return { items, total, page, pageSize, stats: await this.getStats() };
  }

  private async collectItems(filter: PublicProfileDirectoryFilter): Promise<PublicProfileDirectoryItem[]> {
    const items: PublicProfileDirectoryItem[] = [];

    const includeCompanies =
      filter === 'all' ||
      filter === 'companies' ||
      isCompanyCategoryFilter(filter);

    const includePeople = filter === 'all' || filter === 'people' || filter === 'agents';

    if (includeCompanies && COMPANY_DIRECTORY_ENABLED) {
      const companies = await this.prisma.companyDirectoryEntry.findMany({
        where: { publicProfile: true },
        orderBy: [{ profileStatus: 'desc' }, { updatedAt: 'desc' }],
        take: 2000,
      });
      for (const row of companies) {
        const card = serializeCompanyDirectoryCard(row);
        const cat = card.category;
        if (isCompanyCategoryFilter(filter) && cat !== filter) continue;
        items.push({
          type: 'COMPANY',
          id: card.id,
          slug: card.slug,
          displayName: card.name,
          avatarUrl: null,
          logoUrl: card.logoUrl ?? null,
          category: cat,
          categoryLabel: card.categoryLabel,
          city: card.city ?? null,
          region: card.region ?? null,
          rating: card.rating ?? card.xxrealitRating ?? null,
          reviewCount: card.ratingCount ?? card.xxrealitReviewCount ?? null,
          verified: card.isVerified,
          claimed: card.profileStatus !== 'UNCLAIMED',
          source: 'ARES',
          profileUrl: card.href,
          badges: card.badges,
          active: row.profileStatus === 'CLAIMED' || (row.xxrealitReviewCount ?? 0) > 0,
        });
      }
    }

    if (includePeople) {
      const pros = await this.brokers.listPublicProfessionals();
      for (const p of pros) {
        if (filter === 'agents' && !AGENT_ROLES.has(p.role as UserRole)) continue;
        const roleLabel = professionalRoleLabel(p.role as UserRole);
        items.push({
          type: 'USER',
          id: p.id,
          slug: p.slug,
          displayName: p.name ?? roleLabel,
          avatarUrl: p.avatarUrl ?? null,
          logoUrl: null,
          category: p.role,
          categoryLabel: roleLabel,
          city: p.city ?? null,
          region: p.regionLabel ?? null,
          rating: p.ratingAverage ?? null,
          reviewCount: p.ratingCount ?? null,
          verified: p.isVerified,
          claimed: true,
          source: 'XXREALIT',
          profileUrl: p.slug ? `/makler/${p.slug}` : `/profile/${p.id}`,
          badges: p.isVerified ? ['OVĚŘENO'] : [],
          active: Boolean(p.ratingCount && p.ratingCount > 0),
        });
      }

      const users = await this.prisma.user.findMany({
        where: {
          role: UserRole.USER,
          publicProfile: true,
          accountLimited: { not: true },
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          publicProfile: true,
          brokerRegionLabel: true,
          brokerReviewCount: true,
          brokerReviewAverage: true,
          professionalVerified: true,
          _count: { select: { posts: true } },
        },
        take: 1000,
      });
      for (const u of users) {
        if (!isUserPublicProfileEnabled(u)) continue;
        items.push({
          type: 'USER',
          id: u.id,
          slug: null,
          displayName: u.name?.trim() || 'Uživatel portálu',
          avatarUrl: u.avatar,
          logoUrl: null,
          category: 'USER',
          categoryLabel: 'Uživatel portálu',
          city: u.brokerRegionLabel?.trim() || null,
          region: null,
          rating: u.brokerReviewAverage || null,
          reviewCount: u.brokerReviewCount || null,
          verified: u.professionalVerified,
          claimed: true,
          source: 'XXREALIT',
          profileUrl: `/profile/${u.id}`,
          badges: [],
          active: (u._count.posts ?? 0) > 0,
          postCount: u._count.posts,
        });
      }
    }

    return items;
  }

  private sortItems(items: PublicProfileDirectoryItem[], seed: string): PublicProfileDirectoryItem[] {
    const seedNum = hashSeed(seed);
    return [...items].sort((a, b) => {
      const scoreA = profileScore(a) + (hashString(`${seedNum}-${a.id}`) % 7);
      const scoreB = profileScore(b) + (hashString(`${seedNum}-${b.id}`) % 7);
      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.displayName.localeCompare(b.displayName, 'cs');
    });
  }

  private async countProfessionals(): Promise<number> {
    const pros = await this.brokers.listPublicProfessionals();
    return pros.length;
  }
}

function profileScore(item: PublicProfileDirectoryItem): number {
  let score = 0;
  if (item.verified) score += 30;
  if (item.claimed) score += 15;
  if (item.active) score += 20;
  if (item.rating != null && item.rating > 0) score += Math.round(item.rating * 5);
  if (item.reviewCount != null && item.reviewCount > 0) score += Math.min(20, item.reviewCount);
  if (item.type === 'COMPANY' && item.source === 'ARES') score += 5;
  return score;
}

function normalizeFilter(raw?: string): PublicProfileDirectoryFilter {
  const v = (raw ?? 'all').toUpperCase();
  if (v === 'ALL' || v === 'VSE') return 'all';
  if (v === 'PEOPLE' || v === 'LIDE' || v === 'USERS' || v === 'USER') return 'people';
  if (v === 'COMPANIES' || v === 'FIRMY' || v === 'COMPANY') return 'companies';
  if (v === 'AGENTS' || v === 'MAKLERI' || v === 'PROFESSIONALS') return 'agents';
  if (v === 'OTHER' || v === 'OSTATNI') return 'OTHER';
  if (Object.keys(CATEGORY_LABELS).includes(v)) return v as PublicProfileDirectoryFilter;
  return 'all';
}

function isCompanyCategoryFilter(filter: PublicProfileDirectoryFilter): boolean {
  return filter !== 'all' && filter !== 'people' && filter !== 'companies' && filter !== 'agents';
}

function dailySeed(): string {
  return new Date().toISOString().slice(0, 10);
}

function hashSeed(seed: string): number {
  return hashString(seed);
}

function hashString(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h << 5) - h + value.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
