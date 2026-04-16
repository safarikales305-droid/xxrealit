import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, type CompanyAd, type Property } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateCompanyAdDto } from './dto/create-company-ad.dto';
import { UpdateCompanyAdDto } from './dto/update-company-ad.dto';

type AdView = CompanyAd & {
  company: {
    id: string;
    name: string | null;
    companyProfile: { companyName: string; logoUrl: string | null } | null;
  };
};

const CACHE_TTL_MS = 45_000;

const PROPERTY_TAG_TO_AD_HINTS: Record<string, string[]> = {
  pozemek: ['pozemek', 'vystavba-domu', 'novostavba', 'dum', 'modularni-domy', 'drevostavby'],
  dum: ['vystavba-domu', 'novostavba', 'dum', 'hruba-stavba', 'modularni-domy', 'drevostavby'],
  byt: ['rekonstrukce', 'interier', 'byt'],
  rekonstrukce: ['rekonstrukce', 'interier'],
  vystavba: ['vystavba-domu', 'novostavba', 'modularni-domy', 'drevostavby'],
  komercni: ['rekonstrukce', 'fitout', 'komercni'],
};

function norm(v: string | null | undefined): string {
  return (v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function assertStableAdImageUrl(value: string) {
  const imageUrl = value.trim();
  const lower = imageUrl.toLowerCase();
  if (!imageUrl) {
    throw new BadRequestException('URL obrázku reklamy je povinná.');
  }
  if (
    lower.startsWith('blob:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('filesystem:')
  ) {
    throw new BadRequestException('URL obrázku reklamy musí být trvalá veřejná URL, ne dočasná.');
  }
}

function tokenizeProperty(property: Pick<Property, 'propertyType' | 'subType' | 'title' | 'description'>): Set<string> {
  const out = new Set<string>();
  const parts = [property.propertyType, property.subType, property.title, property.description];
  for (const raw of parts) {
    const n = norm(raw);
    if (!n) continue;
    out.add(n);
    for (const token of n.split(/[^a-z0-9]+/g)) {
      if (token.length >= 3) out.add(token);
    }
  }
  if (out.has('stavebni') && out.has('pozemek')) out.add('pozemek');
  if (out.has('rekonstrukce')) out.add('rekonstrukce');
  return out;
}

@Injectable()
export class CompanyAdsService {
  private readonly logger = new Logger(CompanyAdsService.name);
  private readonly cache = new Map<string, { expiresAt: number; ad: AdView | null }>();

  constructor(private readonly prisma: PrismaService) {}

  async listMine(companyId: string) {
    try {
      return await this.prisma.companyAd.findMany({
        where: { companyId },
        orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
      });
    } catch (error: unknown) {
      if (this.isMissingCompanyAdTableError(error)) {
        this.logger.error('CompanyAd table missing while listing own ads; returning empty list.');
        return [];
      }
      throw error;
    }
  }

  async create(companyId: string, dto: CreateCompanyAdDto) {
    try {
      return await this.prisma.companyAd.create({
        data: this.toCreateInput(companyId, dto),
      });
    } catch (error: unknown) {
      if (this.isMissingCompanyAdTableError(error)) {
        this.logger.error('CompanyAd table missing while creating ad.');
        throw new ServiceUnavailableException(
          'Reklamy jsou dočasně nedostupné, zkuste to prosím později.',
        );
      }
      throw error;
    }
  }

  async update(companyId: string, id: string, dto: UpdateCompanyAdDto) {
    let existing: CompanyAd | null = null;
    try {
      existing = await this.prisma.companyAd.findUnique({ where: { id } });
    } catch (error: unknown) {
      if (this.isMissingCompanyAdTableError(error)) {
        this.logger.error('CompanyAd table missing while updating ad.');
        throw new ServiceUnavailableException(
          'Reklamy jsou dočasně nedostupné, zkuste to prosím později.',
        );
      }
      throw error;
    }
    if (!existing) throw new NotFoundException('Reklama nebyla nalezena.');
    if (existing.companyId !== companyId) {
      throw new ForbiddenException('Tuto reklamu nemůžete upravovat.');
    }
    const updated = await this.withCompanyAdTableGuard(
      () =>
        this.prisma.companyAd.update({
          where: { id },
          data: this.toUpdateInput(dto),
        }),
      'updating ad',
    );
    this.cache.delete(existing.id);
    return updated;
  }

  async remove(companyId: string, id: string) {
    const existing = await this.withCompanyAdTableGuard(
      () => this.prisma.companyAd.findUnique({ where: { id } }),
      'deleting ad lookup',
    );
    if (!existing) throw new NotFoundException('Reklama nebyla nalezena.');
    if (existing.companyId !== companyId) {
      throw new ForbiddenException('Tuto reklamu nemůžete smazat.');
    }
    await this.withCompanyAdTableGuard(
      () => this.prisma.companyAd.delete({ where: { id } }),
      'deleting ad',
    );
    this.cache.delete(existing.id);
    return { ok: true };
  }

  async resolveForProperty(propertyId: string) {
    const ad = await this.resolveAdByPropertyId(propertyId);
    return ad ? this.toFeedAdDto(ad) : null;
  }

  async resolveForFeed(propertyIds: string[]) {
    const ids = propertyIds.map((x) => x.trim()).filter((x) => x.length > 0).slice(0, 60);
    const entries = await Promise.all(
      ids.map(async (propertyId) => {
        const ad = await this.resolveAdByPropertyId(propertyId);
        return [propertyId, ad ? this.toFeedAdDto(ad) : null] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private async resolveAdByPropertyId(propertyId: string): Promise<AdView | null> {
    const hit = this.cache.get(propertyId);
    if (hit && hit.expiresAt > Date.now()) return hit.ad;

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, propertyType: true, subType: true, title: true, description: true },
    });
    if (!property) {
      this.cache.set(propertyId, { ad: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }

    const tokens = tokenizeProperty(property);
    const candidates = await this.withCompanyAdTableGuard(
      () =>
        this.prisma.companyAd.findMany({
          where: { isActive: true },
          include: {
            company: {
              select: {
                id: true,
                name: true,
                companyProfile: { select: { companyName: true, logoUrl: true } },
              },
            },
          },
          orderBy: [{ updatedAt: 'desc' }],
          take: 50,
        }),
      'resolving ads for property',
      [] as AdView[],
    );

    let best: AdView | null = null;
    let bestScore = 0;
    for (const candidate of candidates) {
      const score = this.scoreAd(candidate, tokens);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    const resolved = bestScore > 0 ? best : null;
    this.cache.set(propertyId, { ad: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
    return resolved;
  }

  private scoreAd(ad: CompanyAd, propertyTokens: Set<string>): number {
    let score = 0;
    const normalizedCategories = ad.categories.map((x) => norm(x)).filter(Boolean);
    for (const category of normalizedCategories) {
      if (propertyTokens.has(category)) score += 4;
      const mapped = PROPERTY_TAG_TO_AD_HINTS[category];
      if (mapped?.some((hint) => propertyTokens.has(hint))) score += 3;
      for (const token of category.split(/[^a-z0-9]+/g)) {
        if (token.length >= 3 && propertyTokens.has(token)) score += 1;
      }
    }
    return score;
  }

  private isMissingCompanyAdTableError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2021') return false;
    const table = String((error.meta as { table?: unknown } | undefined)?.table ?? '');
    return table.toLowerCase().includes('companyad');
  }

  private async withCompanyAdTableGuard<T>(
    action: () => Promise<T>,
    context: string,
    fallback?: T,
  ): Promise<T> {
    try {
      return await action();
    } catch (error: unknown) {
      if (this.isMissingCompanyAdTableError(error)) {
        this.logger.error(`CompanyAd table missing while ${context}.`);
        if (fallback !== undefined) return fallback;
        throw new ServiceUnavailableException(
          'Reklamy jsou dočasně nedostupné, zkuste to prosím později.',
        );
      }
      throw error;
    }
  }

  private toCreateInput(companyId: string, dto: CreateCompanyAdDto): Prisma.CompanyAdCreateInput {
    assertStableAdImageUrl(dto.imageUrl);
    return {
      company: { connect: { id: companyId } },
      imageUrl: dto.imageUrl.trim(),
      title: dto.title.trim(),
      description: dto.description.trim(),
      ctaText: dto.ctaText.trim(),
      targetUrl: dto.targetUrl.trim(),
      categories: dto.categories.map((x) => x.trim()).filter((x) => x.length > 0),
      isActive: dto.isActive ?? true,
    };
  }

  private toUpdateInput(dto: UpdateCompanyAdDto): Prisma.CompanyAdUpdateInput {
    const data: Prisma.CompanyAdUpdateInput = {};
    if (typeof dto.imageUrl === 'string') {
      assertStableAdImageUrl(dto.imageUrl);
      data.imageUrl = dto.imageUrl.trim();
    }
    if (typeof dto.title === 'string') data.title = dto.title.trim();
    if (typeof dto.description === 'string') data.description = dto.description.trim();
    if (typeof dto.ctaText === 'string') data.ctaText = dto.ctaText.trim();
    if (typeof dto.targetUrl === 'string') data.targetUrl = dto.targetUrl.trim();
    if (Array.isArray(dto.categories)) {
      data.categories = dto.categories.map((x) => x.trim()).filter((x) => x.length > 0);
    }
    if (typeof dto.isActive === 'boolean') data.isActive = dto.isActive;
    return data;
  }

  private toFeedAdDto(ad: AdView) {
    return {
      id: ad.id,
      companyId: ad.companyId,
      imageUrl: ad.imageUrl,
      title: ad.title,
      description: ad.description,
      ctaText: ad.ctaText,
      targetUrl: ad.targetUrl,
      categories: ad.categories,
      company: {
        id: ad.company.id,
        name: ad.company.companyProfile?.companyName ?? ad.company.name ?? 'Stavební firma',
        logoUrl: ad.company.companyProfile?.logoUrl ?? null,
      },
    };
  }
}
