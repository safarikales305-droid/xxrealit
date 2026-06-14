import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FacebookImportStatus, PostCategory, PostSource, UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { PostsService } from '../../posts/posts.service';
import type { FacebookContentProvider } from './facebook-content-provider.interface';
import { FacebookUrlScraperProvider } from './facebook-url.scraper.provider';
import {
  FACEBOOK_IMPORT_TAG,
  FACEBOOK_URL_IMPORT_MAX_NEW,
  FACEBOOK_URL_IMPORT_USER_ERROR,
} from './facebook-url-import.constants';
import { normalizeFacebookPageUrl } from './facebook-url.validation';

const PROFESSIONAL_ROLES: UserRole[] = [
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.FINANCIAL_ADVISOR,
  UserRole.INVESTOR,
];

@Injectable()
export class FacebookUrlImportService {
  private readonly logger = new Logger(FacebookUrlImportService.name);
  private readonly provider: FacebookContentProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    scraper: FacebookUrlScraperProvider,
  ) {
    this.provider = scraper;
  }

  private assertProfessional(role: UserRole) {
    if (!PROFESSIONAL_ROLES.includes(role)) {
      throw new ForbiddenException('Import Facebook je dostupný jen pro profesionální účty.');
    }
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
      return { imported: 0, skipped: true };
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        facebookImportStatus: FacebookImportStatus.RUNNING,
        facebookImportError: null,
      },
    });

    let imported = 0;
    let errorMessage: string | null = null;

    try {
      const scraped = await this.provider.fetchPublicPosts(
        user.facebookUrl,
        FACEBOOK_URL_IMPORT_MAX_NEW,
      );
      for (const item of scraped) {
        const created = await this.importScrapedPost(user.id, user.role, item);
        if (created) imported += 1;
        if (imported >= FACEBOOK_URL_IMPORT_MAX_NEW) break;
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: {
          facebookImportStatus: FacebookImportStatus.OK,
          facebookLastSyncAt: new Date(),
          facebookImportError: imported === 0 ? 'Nebyly nalezeny nové veřejné příspěvky.' : null,
        },
      });

      this.logger.log(
        `FACEBOOK_URL_IMPORT_OK userId=${userId} imported=${imported} trigger=${options?.triggeredBy ?? 'user'}`,
      );
    } catch (err) {
      errorMessage =
        err instanceof Error && err.message.includes('veřejně')
          ? FACEBOOK_URL_IMPORT_USER_ERROR
          : FACEBOOK_URL_IMPORT_USER_ERROR;
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          facebookImportStatus: FacebookImportStatus.ERROR,
          facebookImportError: errorMessage,
        },
      });
      this.logger.warn(
        `FACEBOOK_URL_IMPORT_FAILED userId=${userId} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }

    await this.prisma.facebookUrlImportLog.create({
      data: {
        userId,
        status: errorMessage ? 'ERROR' : 'OK',
        imported,
        error: errorMessage,
      },
    });

    return {
      imported,
      error: errorMessage,
      facebookImportStatus: errorMessage ? FacebookImportStatus.ERROR : FacebookImportStatus.OK,
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
  ): Promise<boolean> {
    const existing = await this.prisma.post.findFirst({
      where: {
        OR: [
          { facebookExternalId: item.externalId },
          { facebookPermalink: item.permalink },
        ],
      },
      select: { id: true },
    });
    if (existing) return false;

    const description = this.formatDescription(item.message);
    const publishedAt = item.publishedAt && !Number.isNaN(item.publishedAt.getTime())
      ? item.publishedAt
      : new Date();
    const category = this.categoryForRole(role);

    let postId: string;
    if (item.videoUrl) {
      const post = await this.posts.createMediaPost(userId, {
        kind: 'video',
        url: item.videoUrl,
        description,
      });
      postId = post.id;
    } else if (item.imageUrl) {
      const post = await this.posts.createMediaPost(userId, {
        kind: 'image',
        url: item.imageUrl,
        description,
      });
      postId = post.id;
    } else {
      const post = await this.posts.create(userId, {
        text: description || FACEBOOK_IMPORT_TAG,
        externalUrl: item.permalink,
        previewSiteName: 'Facebook',
        category,
      });
      postId = post.id;
    }

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        source: PostSource.FACEBOOK,
        isFacebookPagePost: true,
        facebookPermalink: item.permalink,
        facebookExternalId: item.externalId,
        publishedAt,
        createdAt: publishedAt,
        previewSiteName: 'Facebook',
      },
    });

    return true;
  }

  private formatDescription(message: string): string {
    const text = message.trim();
    if (!text) return FACEBOOK_IMPORT_TAG;
    if (text.includes(FACEBOOK_IMPORT_TAG)) return text;
    return `${FACEBOOK_IMPORT_TAG}\n\n${text}`;
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
