import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FacebookImportStatus, PostCategory, PostSource, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import type { FacebookContentProvider } from './facebook-content-provider.interface';
import { FacebookUrlScraperProvider } from './facebook-url.scraper.provider';
import {
  FACEBOOK_BLOCKED_CODE,
  FACEBOOK_URL_IMPORT_MANUAL_LIMIT,
  FACEBOOK_URL_IMPORT_MAX_NEW,
} from './facebook-url-import.constants';
import {
  type FacebookImportDetectedReason,
  userMessageForImportReason,
} from './facebook-import-reason';
import {
  externalIdForFacebookPostUrl,
  normalizeFacebookPageUrl,
  normalizeFacebookPostUrl,
} from './facebook-url.validation';

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

type ImportResult = 'imported' | 'skipped';

@Injectable()
export class FacebookUrlImportService {
  private readonly logger = new Logger(FacebookUrlImportService.name);
  private readonly provider: FacebookContentProvider;

  constructor(
    private readonly prisma: PrismaService,
    scraper: FacebookUrlScraperProvider,
  ) {
    this.provider = scraper;
  }

  private assertProfessional(role: UserRole) {
    if (!PROFESSIONAL_ROLES.includes(role)) {
      throw new ForbiddenException('Import Facebook je dostupný jen pro profesionální účty.');
    }
  }

  private importLimit(triggeredBy?: 'user' | 'cron' | 'admin'): number {
    if (triggeredBy === 'cron') return FACEBOOK_URL_IMPORT_MAX_NEW;
    return FACEBOOK_URL_IMPORT_MANUAL_LIMIT;
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        facebookUrl: true,
        facebookImportEnabled: true,
        facebookLastSyncAt: true,
        facebookImportStatus: true,
        facebookImportError: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      facebookUrl: user.facebookUrl,
      facebookImportEnabled: user.facebookImportEnabled,
      facebookLastSyncAt: user.facebookLastSyncAt?.toISOString() ?? null,
      facebookImportStatus: user.facebookImportStatus,
      facebookImportError: user.facebookImportError,
    };
  }

  async updateSettings(
    userId: string,
    role: UserRole,
    input: { facebookUrl?: string | null; facebookImportEnabled?: boolean },
  ) {
    this.assertProfessional(role);

    const data: {
      facebookUrl?: string | null;
      facebookImportEnabled?: boolean;
      facebookImportError?: string | null;
      facebookImportStatus?: FacebookImportStatus;
    } = {};

    if (input.facebookUrl !== undefined) {
      data.facebookUrl = input.facebookUrl ? normalizeFacebookPageUrl(input.facebookUrl) : null;
      if (!data.facebookUrl) {
        data.facebookImportEnabled = false;
      }
    }
    if (input.facebookImportEnabled !== undefined) {
      data.facebookImportEnabled = input.facebookImportEnabled;
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        facebookUrl: true,
        facebookImportEnabled: true,
        facebookLastSyncAt: true,
        facebookImportStatus: true,
        facebookImportError: true,
      },
    });

    return {
      facebookUrl: updated.facebookUrl,
      facebookImportEnabled: updated.facebookImportEnabled,
      facebookLastSyncAt: updated.facebookLastSyncAt?.toISOString() ?? null,
      facebookImportStatus: updated.facebookImportStatus,
      facebookImportError: updated.facebookImportError,
    };
  }

  async importManualPost(
    userId: string,
    role: UserRole,
    input: { postUrl: string; text?: string; imageUrl?: string },
  ) {
    this.assertProfessional(role);
    const permalink = normalizeFacebookPostUrl(input.postUrl);
    const externalId = externalIdForFacebookPostUrl(permalink);
    const result = await this.importScrapedPost(userId, role, {
      externalId,
      permalink,
      message: input.text?.trim() ?? '',
      imageUrl: input.imageUrl?.trim() || null,
      videoUrl: null,
      publishedAt: null,
    });

    if (result === 'skipped') {
      throw new BadRequestException('Tento Facebook příspěvek už byl importován dříve.');
    }

    return { ok: true, permalink };
  }

  async syncUser(userId: string, options?: { triggeredBy?: 'user' | 'cron' | 'admin' }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        facebookUrl: true,
        facebookImportEnabled: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.facebookUrl?.trim()) {
      throw new BadRequestException('Nejprve zadejte URL Facebook stránky.');
    }
    if (!user.facebookImportEnabled && options?.triggeredBy === 'cron') {
      return { imported: 0, found: 0, skipped: 0, skippedRun: true };
    }

    const limit = this.importLimit(options?.triggeredBy);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        facebookImportStatus: FacebookImportStatus.RUNNING,
        facebookImportError: null,
      },
    });

    let imported = 0;
    let skipped = 0;
    let found = 0;
    let detectedReason: FacebookImportDetectedReason = 'NO_PUBLIC_POSTS';
    let fetchUrl: string | null = null;
    let httpStatus: number | null = null;
    let contentLength: number | null = null;
    let rawSnippet: string | null = null;
    let userMessage: string | null = null;
    let status: 'OK' | 'ERROR' = 'OK';

    try {
      const scrape = await this.provider.fetchPublicPosts(user.facebookUrl, limit);
      found = scrape.posts.length;
      detectedReason = scrape.detectedReason;
      fetchUrl = scrape.fetchUrl;
      httpStatus = scrape.httpStatus;
      contentLength = scrape.contentLength;
      rawSnippet = scrape.rawSnippet;

      for (const item of scrape.posts) {
        const result = await this.importScrapedPost(user.id, user.role, item);
        if (result === 'imported') {
          imported += 1;
          if (options?.triggeredBy === 'cron' && imported >= FACEBOOK_URL_IMPORT_MAX_NEW) break;
        } else {
          skipped += 1;
        }
      }

      if (imported > 0) {
        detectedReason = 'OK';
        userMessage = null;
      } else if (found > 0) {
        detectedReason = 'OK';
        userMessage = userMessageForImportReason('OK', { allDuplicates: true });
      } else {
        userMessage = userMessageForImportReason(detectedReason);
      }

      const importStatus =
        detectedReason === 'FACEBOOK_BLOCKED' ? FacebookImportStatus.ERROR : FacebookImportStatus.OK;
      if (detectedReason === 'FACEBOOK_BLOCKED') {
        status = 'ERROR';
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          facebookImportStatus: importStatus,
          facebookLastSyncAt: new Date(),
          facebookImportError: userMessage,
        },
      });

      this.logger.log(
        `FACEBOOK_URL_IMPORT_OK userId=${userId} reason=${detectedReason} found=${found} imported=${imported} skipped=${skipped} trigger=${options?.triggeredBy ?? 'user'}`,
      );
    } catch (err) {
      status = 'ERROR';
      detectedReason = 'URL_NOT_AVAILABLE';
      userMessage = userMessageForImportReason('URL_NOT_AVAILABLE');
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          facebookImportStatus: FacebookImportStatus.ERROR,
          facebookImportError: userMessage,
        },
      });
      this.logger.warn(
        `FACEBOOK_URL_IMPORT_FAILED userId=${userId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const logError =
      status === 'ERROR'
        ? detectedReason === 'FACEBOOK_BLOCKED'
          ? FACEBOOK_BLOCKED_CODE
          : userMessage
        : userMessage;

    await this.prisma.facebookUrlImportLog.create({
      data: {
        userId,
        status,
        found,
        imported,
        skipped,
        importedCount: imported,
        skippedDuplicates: skipped,
        fetchUrl,
        httpStatus,
        contentLength,
        detectedReason,
        rawSnippet,
        error: logError,
      },
    });

    return {
      imported,
      found,
      skipped,
      detectedReason,
      error: userMessage,
      facebookImportStatus:
        status === 'ERROR' ? FacebookImportStatus.ERROR : FacebookImportStatus.OK,
    };
  }

  async syncAllEnabled() {
    const users = await this.prisma.user.findMany({
      where: {
        facebookImportEnabled: true,
        facebookUrl: { not: null },
        role: { in: PROFESSIONAL_ROLES },
      },
      select: { id: true },
      take: 200,
    });

    let processed = 0;
    let totalImported = 0;
    for (const u of users) {
      try {
        const res = await this.syncUser(u.id, { triggeredBy: 'cron' });
        totalImported += res.imported ?? 0;
        processed += 1;
      } catch (err) {
        this.logger.warn(
          `FACEBOOK_URL_CRON_USER_FAIL userId=${u.id} reason=${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(`FACEBOOK_URL_CRON_DONE processed=${processed} imported=${totalImported}`);
    return { processed, imported: totalImported };
  }

  async adminList() {
    const rows = await this.prisma.user.findMany({
      where: {
        OR: [{ facebookUrl: { not: null } }, { facebookImportEnabled: true }],
        role: { in: PROFESSIONAL_ROLES },
      },
      orderBy: { facebookLastSyncAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        facebookUrl: true,
        facebookImportEnabled: true,
        facebookLastSyncAt: true,
        facebookImportStatus: true,
        facebookImportError: true,
      },
      take: 500,
    });

    const logs = await this.prisma.facebookUrlImportLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return { profiles: rows, recentLogs: logs };
  }

  async adminSetEnabled(userId: string, enabled: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { facebookImportEnabled: enabled },
      select: {
        id: true,
        facebookImportEnabled: true,
      },
    });
  }

  private async resolveProfessionalProfileId(
    userId: string,
    role: UserRole,
  ): Promise<string | null> {
    switch (role) {
      case UserRole.AGENT: {
        const row = await this.prisma.agentProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.COMPANY: {
        const row = await this.prisma.companyProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.AGENCY: {
        const row = await this.prisma.agencyProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.FINANCIAL_ADVISOR: {
        const row = await this.prisma.financialAdvisorProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      case UserRole.INVESTOR: {
        const row = await this.prisma.investorProfile.findUnique({
          where: { userId },
          select: { id: true },
        });
        return row?.id ?? null;
      }
      default:
        return null;
    }
  }

  private async importScrapedPost(
    userId: string,
    role: UserRole,
    item: {
      externalId: string;
      permalink: string;
      message: string;
      imageUrl?: string | null;
      videoUrl?: string | null;
      publishedAt?: Date | null;
    },
  ): Promise<ImportResult> {
    const permalink = item.permalink.trim();
    const externalId = item.externalId.trim();

    const existing = await this.prisma.post.findFirst({
      where: {
        OR: [
          { facebookExternalId: externalId },
          { facebookPermalink: permalink },
          { externalUrl: permalink },
        ],
      },
      select: { id: true },
    });
    if (existing) return 'skipped';

    const text = item.message.trim();
    const publishedAt =
      item.publishedAt && !Number.isNaN(item.publishedAt.getTime()) ? item.publishedAt : null;
    const category = this.categoryForRole(role);
    const professionalProfileId = await this.resolveProfessionalProfileId(userId, role);
    const importedAt = new Date();

    const mediaCreate: Array<{ url: string; type: string; order: number }> = [];
    if (item.videoUrl?.trim()) {
      mediaCreate.push({ url: item.videoUrl.trim(), type: 'video', order: 0 });
    } else if (item.imageUrl?.trim()) {
      mediaCreate.push({ url: item.imageUrl.trim(), type: 'image', order: 1 });
    }

    try {
      await this.prisma.post.create({
        data: {
          type: 'post',
          category,
          userId,
          professionalProfileId,
          title: '',
          price: 0,
          city: '',
          description: text,
          content: text || null,
          imageUrl: item.imageUrl?.trim() || null,
          videoUrl: item.videoUrl?.trim() || null,
          externalUrl: permalink,
          facebookPermalink: permalink,
          facebookExternalId: externalId,
          previewImage: item.imageUrl?.trim() || null,
          previewSiteName: 'Facebook',
          source: PostSource.FACEBOOK,
          isFacebookPagePost: true,
          publishedAt,
          createdAt: importedAt,
          media: mediaCreate.length ? { create: mediaCreate } : undefined,
        },
      });
      return 'imported';
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'P2002') return 'skipped';
      throw err;
    }
  }

  private categoryForRole(role: UserRole): PostCategory {
    switch (role) {
      case UserRole.COMPANY:
        return PostCategory.STAVEBNI_FIRMY;
      case UserRole.AGENCY:
        return PostCategory.REALITNI_KANCELARE;
      case UserRole.FINANCIAL_ADVISOR:
        return PostCategory.FINANCNI_PORADCI;
      case UserRole.INVESTOR:
        return PostCategory.INVESTORI;
      default:
        return PostCategory.MAKLERI;
    }
  }
}
