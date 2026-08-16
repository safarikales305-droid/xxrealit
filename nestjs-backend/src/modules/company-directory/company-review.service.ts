import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CompanyContactSourceType,
  CompanyContactStatus,
  CompanyDirectoryCategory,
  CompanyReviewCompanyNotificationStatus,
  CompanyReviewSentiment,
  CompanyReviewStatus,
  PostCategory,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { EmailsService } from '../emails/emails.service';
import { SocialPublishEnqueueService } from '../social/autopost/social-publish-enqueue.service';
import { resolveFrontendUrl } from '../../common/resolve-frontend-url';
import { CompanyAuditService } from './company-audit.service';
import { CompanyEmailService } from './company-email.service';
import {
  COMPANY_REVIEWS_ENABLED,
  COMPANY_REVIEW_SOCIAL_PUBLISHING_ENABLED,
  COMPANY_CONTACT_DISCOVERY_ENABLED,
} from './company-directory.constants';
import { CompanyContactDiscoveryService } from './company-contact-discovery.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

function sentimentFromRating(rating: number, explicit?: string): CompanyReviewSentiment {
  if (explicit === 'POSITIVE' || explicit === 'NEGATIVE' || explicit === 'NEUTRAL') {
    return explicit;
  }
  if (rating >= 4) return CompanyReviewSentiment.POSITIVE;
  if (rating <= 2) return CompanyReviewSentiment.NEGATIVE;
  return CompanyReviewSentiment.NEUTRAL;
}

function mapCompanyCategoryToPostCategory(
  category: CompanyDirectoryCategory | undefined,
): PostCategory {
  switch (category) {
    case CompanyDirectoryCategory.STAVEBNICTVI:
      return PostCategory.STAVEBNI_FIRMY;
    case CompanyDirectoryCategory.REALITY:
      return PostCategory.REALITNI_KANCELARE;
    case CompanyDirectoryCategory.FINANCE:
    case CompanyDirectoryCategory.HYPOTEKA:
      return PostCategory.FINANCNI_PORADCI;
    case CompanyDirectoryCategory.REMESLA:
      return PostCategory.REMESLNICI;
    default:
      return PostCategory.STAVEBNI_FIRMY;
  }
}

@Injectable()
export class CompanyReviewService {
  private readonly log = new Logger(CompanyReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emails: EmailsService,
    private readonly audit: CompanyAuditService,
    private readonly companyEmail: CompanyEmailService,
    private readonly socialEnqueue: SocialPublishEnqueueService,
    private readonly contactDiscovery: CompanyContactDiscoveryService,
  ) {}

  async createReview(input: {
    companyId?: string;
    companySlug?: string;
    rating: number;
    sentiment?: string;
    title?: string;
    body: string;
    authorEmail: string;
    authorDisplayName?: string;
    authorPhone?: string;
    submittedBusinessEmail?: string;
    confirmedExperience: boolean;
    media?: Array<{ type: 'IMAGE' | 'VIDEO'; url: string; thumbnailUrl?: string; mimeType?: string }>;
  }) {
    if (!COMPANY_REVIEWS_ENABLED) {
      throw new BadRequestException({
        code: 'REVIEWS_DISABLED',
        message: 'Recenze firem jsou vypnuté.',
      });
    }
    if (!input.confirmedExperience) {
      throw new BadRequestException({
        code: 'EXPERIENCE_NOT_CONFIRMED',
        message: 'Potvrďte, že recenze vychází ze skutečné zkušenosti.',
      });
    }

    const rating = Number(input.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException({
        code: 'INVALID_RATING',
        message: 'Hodnocení musí být 1–5.',
      });
    }
    if (!input.body?.trim()) {
      throw new BadRequestException({
        code: 'BODY_REQUIRED',
        message: 'Text recenze je povinný.',
      });
    }
    const email = input.authorEmail?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException({
        code: 'AUTHOR_EMAIL_REQUIRED',
        message: 'Email autora je povinný.',
      });
    }

    this.log.log(
      JSON.stringify({
        event: 'REVIEW_CREATE_REQUEST',
        companyId: input.companyId ?? null,
        companySlug: input.companySlug ?? null,
        authorEmail: email.replace(/(^.).+(@.*$)/, '$1***$2'),
        hasMedia: (input.media?.length ?? 0) > 0,
        mediaCount: input.media?.length ?? 0,
        rating,
        sentiment: input.sentiment ?? null,
      }),
    );

    try {
      const company = await this.resolveCompany(input.companyId, input.companySlug);
      const authorUser = await this.resolveAuthorUser(email, input.authorDisplayName);

      const duplicate = await this.prisma.companyReview.findFirst({
        where: {
          companyId: company.id,
          authorUserId: authorUser.id,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          status: {
            in: [
              CompanyReviewStatus.EMAIL_VERIFICATION_REQUIRED,
              CompanyReviewStatus.PENDING,
              CompanyReviewStatus.PUBLISHED,
            ],
          },
        },
      });
      if (duplicate) {
        throw new ConflictException({
          code: 'REVIEW_DUPLICATE',
          message:
            'Nedávno jste pro tuto firmu recenzi odeslali. Zkuste to později nebo upravte existující recenzi.',
        });
      }

      const token = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const submittedBusinessEmail = input.submittedBusinessEmail?.trim().toLowerCase() || null;

      const review = await this.prisma.$transaction(async (tx) => {
        const created = await tx.companyReview.create({
          data: {
            companyId: company.id,
            authorUserId: authorUser.id,
            rating,
            sentiment: sentimentFromRating(rating, input.sentiment),
            title: input.title?.trim() ?? '',
            body: input.body.trim(),
            authorDisplayName: input.authorDisplayName?.trim() || authorUser.name || 'Uživatel',
            authorPhone: input.authorPhone?.trim() || null,
            emailVerificationToken: token,
            emailVerificationExpires: expires,
            status: CompanyReviewStatus.EMAIL_VERIFICATION_REQUIRED,
            submittedBusinessEmail,
            submittedEmailStatus: submittedBusinessEmail
              ? CompanyContactStatus.REVIEW_REQUIRED
              : null,
            media: input.media?.length
              ? {
                  create: input.media.map((m, idx) => ({
                    type: m.type,
                    url: m.url,
                    thumbnailUrl: m.thumbnailUrl ?? null,
                    mimeType: m.mimeType ?? null,
                    sortOrder: idx,
                  })),
                }
              : undefined,
          },
          include: { media: true },
        });

        if (submittedBusinessEmail) {
          await tx.companyContact.create({
            data: {
              companyId: company.id,
              email: submittedBusinessEmail,
              sourceType: CompanyContactSourceType.USER_SUBMITTED,
              status: CompanyContactStatus.REVIEW_REQUIRED,
              confidence: 0,
            },
          });
        }

        return created;
      });

      const verifyUrl = `${resolveFrontendUrl()}/firmy/recenze/overit?token=${token}&reviewId=${review.id}&slug=${encodeURIComponent(company.slug)}`;
      const emailSent = await this.sendReviewVerificationEmailSafe(email, verifyUrl);

      if (
        COMPANY_CONTACT_DISCOVERY_ENABLED &&
        !company.verifiedBusinessEmail &&
        !submittedBusinessEmail
      ) {
        void this.contactDiscovery.enqueueDiscover(company.id).catch((err) => {
          this.log.warn(`Contact discovery enqueue failed for ${company.id}: ${String(err)}`);
        });
      }

      await this.audit.log({
        companyId: company.id,
        action: 'REVIEW_CREATE',
        message: `Vytvořena recenze ${review.id}, čeká na ověření emailu`,
        meta: { reviewId: review.id, emailSent },
        actorUserId: authorUser.id,
      });

      return {
        reviewId: review.id,
        status: review.status,
        emailVerificationRequired: true,
        emailSent,
        message: emailSent
          ? 'Recenze byla uložena. Na váš email jsme poslali ověřovací odkaz.'
          : 'Recenze byla uložena. Ověřovací email se nepodařilo odeslat — kontaktujte podporu nebo zkuste znovu.',
      };
    } catch (err) {
      this.logReviewCreateError(err, input);
      throw this.mapReviewCreateError(err);
    }
  }

  private async resolveCompany(companyId?: string, companySlug?: string) {
    const company = companyId
      ? await this.prisma.companyDirectoryEntry.findUnique({ where: { id: companyId } })
      : companySlug
        ? await this.prisma.companyDirectoryEntry.findFirst({
            where: { slug: companySlug },
          })
        : null;
    if (!company) {
      throw new NotFoundException({
        code: 'COMPANY_NOT_FOUND',
        message: 'Firma nenalezena.',
      });
    }
    return company;
  }

  private async sendReviewVerificationEmailSafe(email: string, verifyUrl: string): Promise<boolean> {
    try {
      await this.emails.sendEmailVerificationEmail({ email, verifyUrl });
      return true;
    } catch (err) {
      this.log.warn(
        JSON.stringify({
          event: 'REVIEW_VERIFY_EMAIL_FAILED',
          email: email.replace(/(^.).+(@.*$)/, '$1***$2'),
          error: err instanceof Error ? err.message.slice(0, 200) : String(err),
        }),
      );
      return false;
    }
  }

  private logReviewCreateError(
    err: unknown,
    input: { companyId?: string; authorEmail: string; media?: unknown[] },
  ) {
    const base = {
      event: 'REVIEW_CREATE_FAILED',
      companyId: input.companyId ?? null,
      hasMedia: (input.media?.length ?? 0) > 0,
      mediaCount: input.media?.length ?? 0,
    };
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      this.log.error(
        JSON.stringify({
          ...base,
          prismaCode: err.code,
          prismaMeta: err.meta,
          message: err.message,
        }),
      );
      return;
    }
    if (err instanceof BadRequestException || err instanceof NotFoundException || err instanceof ConflictException) {
      return;
    }
    this.log.error(
      JSON.stringify({
        ...base,
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
      }),
    );
  }

  private mapReviewCreateError(err: unknown): never {
    if (
      err instanceof BadRequestException ||
      err instanceof NotFoundException ||
      err instanceof ConflictException ||
      err instanceof ServiceUnavailableException
    ) {
      throw err;
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        throw new ConflictException({
          code: 'REVIEW_CREATE_CONFLICT',
          message: 'Recenzi se nepodařilo uložit kvůli duplicitě záznamu.',
        });
      }
      if (err.code === 'P2003') {
        throw new BadRequestException({
          code: 'REVIEW_CREATE_INVALID_REFERENCE',
          message: 'Neplatný odkaz na firmu nebo autora.',
        });
      }
      if (err.code === 'P2022' || err.code === 'P2021') {
        throw new ServiceUnavailableException({
          code: 'REVIEW_DB_SCHEMA_OUTDATED',
          message: 'Databáze není synchronizovaná. Kontaktujte správce.',
        });
      }
    }
    throw new InternalServerErrorException({
      code: 'REVIEW_CREATE_FAILED',
      message: 'Recenzi se nepodařilo uložit.',
    });
  }

  async verifyReviewEmail(token: string) {
    const review = await this.prisma.companyReview.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpires: { gt: new Date() },
      },
    });
    if (!review) {
      throw new BadRequestException('Neplatný nebo expirovaný ověřovací odkaz.');
    }

    await this.prisma.$transaction([
      this.prisma.companyReview.update({
        where: { id: review.id },
        data: {
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpires: null,
          status: CompanyReviewStatus.PENDING,
        },
      }),
      this.prisma.user.update({
        where: { id: review.authorUserId },
        data: { emailVerified: true, emailVerifiedAt: new Date() },
      }),
    ]);

    await this.audit.log({
      companyId: review.companyId,
      action: 'REVIEW_VERIFY',
      message: `Email recenze ${review.id} ověřen`,
      meta: { reviewId: review.id },
    });

    await this.publishReview(review.id, { autoModerate: true });

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: review.companyId },
      select: { slug: true },
    });

    return { ok: true, reviewId: review.id, slug: company?.slug ?? null };
  }

  async publishReview(reviewId: string, opts?: { autoModerate?: boolean; adminUserId?: string }) {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { company: true, media: true, authorUser: true },
    });
    if (!review) throw new NotFoundException('Recenze nenalezena.');
    if (!review.emailVerified) {
      throw new BadRequestException('Email autora není ověřen.');
    }

    const publishedAt = new Date();
    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        status: CompanyReviewStatus.PUBLISHED,
        publishedAt,
      },
    });

    await this.recalculateCompanyRating(review.companyId);
    const postId = await this.createPortalPostFromReview(review);

    await this.prisma.companyDirectoryEntry.updateMany({
      where: { id: review.companyId, firstPostCreatedAt: null },
      data: { firstPostCreatedAt: publishedAt },
    });

    await this.audit.log({
      companyId: review.companyId,
      action: 'REVIEW_PUBLISH',
      message: `Recenze ${reviewId} publikována`,
      actorUserId: opts?.adminUserId ?? review.authorUserId,
      meta: { postId },
    });

    void this.companyEmail.notifyCompanyNewReview(review.companyId, reviewId);

    if (COMPANY_REVIEW_SOCIAL_PUBLISHING_ENABLED && postId) {
      this.socialEnqueue.firePostCreated(postId);
      await this.audit.log({
        companyId: review.companyId,
        action: 'FACEBOOK_PUBLISH',
        message: `Recenze ${reviewId} zařazena do social publish fronty`,
        meta: { postId },
      });
    }

    return { ok: true, postId };
  }

  async listPublicReviews(companyId: string) {
    const rows = await this.prisma.companyReview.findMany({
      where: { companyId, status: CompanyReviewStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
      include: {
        media: { orderBy: { sortOrder: 'asc' } },
        response: true,
      },
    });

    return rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      sentiment: r.sentiment,
      title: r.title,
      body: r.body,
      authorDisplayName: r.authorDisplayName ?? 'Uživatel',
      publishedAt: r.publishedAt?.toISOString() ?? null,
      media: r.media.map((m) => ({
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
      })),
      response: r.response
        ? {
            body: r.response.body,
            verifiedCompanyResponse: r.response.verifiedCompanyResponse,
            createdAt: r.response.createdAt.toISOString(),
          }
        : null,
    }));
  }

  async getReviewSummary(companyId: string) {
    const published = await this.prisma.companyReview.findMany({
      where: { companyId, status: CompanyReviewStatus.PUBLISHED },
      select: { rating: true, sentiment: true },
    });
    if (published.length === 0) {
      return {
        average: null,
        count: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        positive: 0,
        negative: 0,
      };
    }
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let positive = 0;
    let negative = 0;
    for (const r of published) {
      sum += r.rating;
      const key = Math.min(5, Math.max(1, r.rating)) as 1 | 2 | 3 | 4 | 5;
      distribution[key] += 1;
      if (r.sentiment === CompanyReviewSentiment.POSITIVE) positive += 1;
      if (r.sentiment === CompanyReviewSentiment.NEGATIVE) negative += 1;
    }
    return {
      average: Math.round((sum / published.length) * 10) / 10,
      count: published.length,
      distribution,
      positive,
      negative,
    };
  }

  async submitCompanyResponse(input: {
    reviewId: string;
    userId: string;
    body: string;
  }) {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: input.reviewId },
      include: { company: true },
    });
    if (!review) throw new NotFoundException('Recenze nenalezena.');

    const company = review.company;
    const canRespond =
      company.claimedByUserId === input.userId ||
      company.profileStatus === 'VERIFIED';

    if (!canRespond) {
      throw new BadRequestException('Pro reakci na recenzi je nutné převzít a ověřit profil firmy.');
    }

    const response = await this.prisma.companyReviewResponse.upsert({
      where: { reviewId: input.reviewId },
      create: {
        reviewId: input.reviewId,
        companyId: company.id,
        authorUserId: input.userId,
        body: input.body.trim(),
        verifiedCompanyResponse: true,
      },
      update: {
        body: input.body.trim(),
        authorUserId: input.userId,
      },
    });

    await this.audit.log({
      companyId: company.id,
      action: 'COMPANY_RESPONSE',
      message: `Reakce firmy na recenzi ${review.id}`,
      actorUserId: input.userId,
    });

    return response;
  }

  async moderateReview(
    reviewId: string,
    action: 'approve' | 'reject' | 'hide',
    adminUserId?: string,
    note?: string,
  ) {
    const status =
      action === 'approve'
        ? CompanyReviewStatus.PUBLISHED
        : action === 'hide'
          ? CompanyReviewStatus.HIDDEN
          : CompanyReviewStatus.REJECTED;

    if (action === 'approve') {
      return this.publishReview(reviewId, { adminUserId });
    }

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: { status, moderationNote: note ?? null },
    });

    await this.audit.log({
      action: 'MODERATION',
      message: `Recenze ${reviewId} → ${status}`,
      actorUserId: adminUserId,
      meta: { reviewId, note },
    });

    return { ok: true, status };
  }

  async listAdminReviews(status?: string) {
    const where =
      status?.trim() && status !== 'ALL'
        ? { status: status.trim().toUpperCase() as CompanyReviewStatus }
        : {};
    const rows = await this.prisma.companyReview.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        company: { select: { id: true, name: true, slug: true } },
        authorUser: { select: { id: true, email: true, name: true } },
        media: true,
        _count: { select: { reports: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      company: r.company,
      authorEmail: r.authorUser.email,
      authorName: r.authorDisplayName ?? r.authorUser.name,
      rating: r.rating,
      sentiment: r.sentiment,
      title: r.title,
      bodyPreview: r.body.slice(0, 160),
      imageCount: r.media.filter((m) => m.type === 'IMAGE').length,
      videoCount: r.media.filter((m) => m.type === 'VIDEO').length,
      status: r.status,
      emailVerified: r.emailVerified,
      companyNotificationStatus: r.companyNotificationStatus,
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      reportCount: r._count.reports,
      media: r.media,
    }));
  }

  async deleteReviewMedia(mediaId: string) {
    const media = await this.prisma.companyReviewMedia.findUnique({
      where: { id: mediaId },
    });
    if (!media) throw new NotFoundException('Médium nenalezeno.');
    await this.prisma.companyReviewMedia.delete({ where: { id: mediaId } });
    await this.audit.log({
      action: 'MODERATION',
      message: `Odstraněno médium ${mediaId} z recenze ${media.reviewId}`,
      meta: { mediaId, reviewId: media.reviewId },
    });
    return { ok: true };
  }

  private async resolveAuthorUser(email: string, displayName?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    try {
      return await this.prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: displayName?.trim() || email.split('@')[0] || 'Uživatel',
          emailVerified: false,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const retry = await this.prisma.user.findUnique({ where: { email } });
        if (retry) return retry;
      }
      throw err;
    }
  }

  private async recalculateCompanyRating(companyId: string) {
    const agg = await this.prisma.companyReview.aggregate({
      where: { companyId, status: CompanyReviewStatus.PUBLISHED },
      _avg: { rating: true },
      _count: true,
    });
    await this.prisma.companyDirectoryEntry.update({
      where: { id: companyId },
      data: {
        xxrealitRatingAverage: agg._avg.rating,
        xxrealitReviewCount: agg._count,
      },
    });
  }

  private async createPortalPostFromReview(
    review: Prisma.CompanyReviewGetPayload<{
      include: { company: true; media: true; authorUser: true };
    }>,
  ): Promise<string | null> {
    const existing = await this.prisma.post.findFirst({
      where: { companyReviewId: review.id },
    });
    if (existing) return existing.id;

    const company = review.company;
    const primaryCategory = company.categories[0];
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const sentimentLabel =
      review.sentiment === CompanyReviewSentiment.POSITIVE
        ? 'Pozitivní zkušenost'
        : review.sentiment === CompanyReviewSentiment.NEGATIVE
          ? 'Negativní zkušenost'
          : 'Neutrální zkušenost';

    const authorName = review.authorDisplayName ?? review.authorUser.name ?? 'Uživatel';
    const title = `${authorName} ohodnotil firmu ${company.name}`;
    const description = `${stars}\n\n${sentimentLabel}\n\n${review.body.slice(0, 280)}`;
    const imageUrl = review.media.find((m) => m.type === 'IMAGE')?.url ?? null;
    const videoUrl = review.media.find((m) => m.type === 'VIDEO')?.url ?? null;

    const post = await this.prisma.post.create({
      data: {
        userId: review.authorUserId,
        title,
        description,
        content: review.body,
        imageUrl,
        videoUrl,
        city: company.city ?? '',
        type: 'COMPANY_REVIEW',
        category: mapCompanyCategoryToPostCategory(primaryCategory),
        companyDirectoryId: company.id,
        companyReviewId: review.id,
        publishedAt: new Date(),
        media:
          review.media.length > 0
            ? {
                create: review.media.map((m, idx) => ({
                  url: m.url,
                  type: m.type === 'VIDEO' ? 'video' : 'image',
                  order: idx,
                })),
              }
            : undefined,
      },
    });

    return post.id;
  }
}
