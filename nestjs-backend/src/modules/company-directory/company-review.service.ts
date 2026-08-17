import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
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
import { resolveFrontendUrl, buildPasswordResetUrl } from '../../common/resolve-frontend-url';
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
    loggedInUserId?: string;
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
      let authorCreated = false;
      const authorUser = input.loggedInUserId
        ? await this.prisma.user.findUniqueOrThrow({ where: { id: input.loggedInUserId } })
        : await (async () => {
            const resolved = await this.resolveAuthorUser(email, input.authorDisplayName);
            authorCreated = resolved.created;
            return resolved.user;
          })();

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

      if (authorCreated) {
        void this.sendReviewAuthorOnboardingEmail(authorUser.id, email, company.name);
      }

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
      message: `Email recenze ${review.id} ověřen — čeká na schválení`,
      meta: { reviewId: review.id },
    });

    void this.sendAuthorReviewPendingEmail(review.id);

    const company = await this.prisma.companyDirectoryEntry.findUnique({
      where: { id: review.companyId },
      select: { slug: true },
    });

    return {
      ok: true,
      reviewId: review.id,
      slug: company?.slug ?? null,
      status: CompanyReviewStatus.PENDING,
      message: 'Email byl ověřen. Recenze čeká na schválení administrátorem.',
    };
  }

  async publishReview(reviewId: string, opts?: { adminUserId?: string }) {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { company: true, media: true, authorUser: true },
    });
    if (!review) throw new NotFoundException('Recenze nenalezena.');
    if (review.status === CompanyReviewStatus.REMOVED) {
      throw new BadRequestException('Odstraněnou recenzi nelze publikovat.');
    }
    if (!review.emailVerified && !opts?.adminUserId) {
      throw new BadRequestException('Email autora není ověřen.');
    }

    const wasPublished = review.status === CompanyReviewStatus.PUBLISHED;
    const publishedAt = review.publishedAt ?? new Date();
    const now = new Date();

    if (!review.emailVerified && opts?.adminUserId) {
      await this.prisma.user.update({
        where: { id: review.authorUserId },
        data: { emailVerified: true, emailVerifiedAt: now },
      });
    }

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        status: CompanyReviewStatus.PUBLISHED,
        publishedAt,
        emailVerified: true,
        approvedAt: now,
        approvedByAdminId: opts?.adminUserId ?? review.approvedByAdminId,
        rejectedAt: null,
        rejectedByAdminId: null,
        hiddenAt: null,
        hiddenByAdminId: null,
        reviewNeedsModeration: false,
        lastApprovedRating: null,
        lastApprovedSentiment: null,
        lastApprovedTitle: null,
        lastApprovedBody: null,
        lastApprovedMediaJson: Prisma.JsonNull,
        moderationNote: null,
      },
    });

    await this.recalculateCompanyRating(review.companyId);
    const postId = await this.syncPortalPostFromReview(reviewId, true);

    await this.prisma.companyDirectoryEntry.updateMany({
      where: { id: review.companyId, firstPostCreatedAt: null },
      data: { firstPostCreatedAt: publishedAt },
    });

    await this.audit.log({
      companyId: review.companyId,
      action: 'REVIEW_PUBLISH',
      message: `Recenze ${reviewId} publikována`,
      actorUserId: opts?.adminUserId ?? review.authorUserId,
      meta: { postId, adminApproved: Boolean(opts?.adminUserId) },
    });

    if (
      review.companyNotificationStatus !== CompanyReviewCompanyNotificationStatus.SENT &&
      review.companyNotificationStatus !== CompanyReviewCompanyNotificationStatus.QUEUED
    ) {
      void this.companyEmail.notifyCompanyNewReview(review.companyId, reviewId);
    }

    if (!wasPublished || review.reviewNeedsModeration) {
      void this.sendAuthorReviewPublishedEmail(reviewId);
    }

    if (COMPANY_REVIEW_SOCIAL_PUBLISHING_ENABLED && postId && !wasPublished) {
      this.socialEnqueue.firePostCreated(postId);
      await this.audit.log({
        companyId: review.companyId,
        action: 'FACEBOOK_PUBLISH',
        message: `Recenze ${reviewId} zařazena do social publish fronty`,
        meta: { postId },
      });
    }

    return { ok: true, status: CompanyReviewStatus.PUBLISHED, postId };
  }

  async listPublicReviews(companyId: string) {
    const rows = await this.prisma.companyReview.findMany({
      where: {
        companyId,
        OR: [
          { status: CompanyReviewStatus.PUBLISHED },
          {
            status: CompanyReviewStatus.PENDING,
            lastApprovedBody: { not: null },
          },
        ],
      },
      orderBy: { publishedAt: 'desc' },
      include: {
        media: { orderBy: { sortOrder: 'asc' }, where: { removedAt: null } },
        response: true,
      },
    });

    return rows.map((r) => this.serializePublicReview(r));
  }

  private serializePublicReview(
    r: Prisma.CompanyReviewGetPayload<{
      include: { media: true; response: true };
    }>,
  ) {
    const useSnapshot =
      r.status === CompanyReviewStatus.PENDING && r.lastApprovedBody && r.reviewNeedsModeration;
    const rating = useSnapshot ? (r.lastApprovedRating ?? r.rating) : r.rating;
    const sentiment = useSnapshot ? (r.lastApprovedSentiment ?? r.sentiment) : r.sentiment;
    const title = useSnapshot ? (r.lastApprovedTitle ?? r.title) : r.title;
    const body = useSnapshot ? (r.lastApprovedBody ?? r.body) : r.body;
    const media = useSnapshot
      ? this.mediaFromSnapshot(r.lastApprovedMediaJson, r.media)
      : r.media.filter((m) => !m.removedAt);

    return {
      id: r.id,
      rating,
      sentiment,
      title,
      body,
      authorDisplayName: r.authorDisplayName ?? 'Uživatel',
      publishedAt: r.publishedAt?.toISOString() ?? null,
      media: media.map((m) => ({
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
    };
  }

  private mediaFromSnapshot(
    snapshot: Prisma.JsonValue | null,
    fallback: Array<{ type: string; url: string; thumbnailUrl: string | null }>,
  ) {
    if (!snapshot || !Array.isArray(snapshot)) {
      return fallback.filter((m) => true);
    }
    return (snapshot as Array<{ type: string; url: string; thumbnailUrl?: string | null }>).map(
      (m) => ({
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl ?? null,
      }),
    );
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
    action: 'approve' | 'reject' | 'hide' | 'remove' | 'reject_changes',
    adminUserId?: string,
    note?: string,
    removalReason?: string,
  ) {
    const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Recenze nenalezena.');

    if (action === 'approve') {
      return this.publishReview(reviewId, { adminUserId });
    }

    if (action === 'reject_changes') {
      return this.rejectAuthorChanges(reviewId, adminUserId, note);
    }

    const now = new Date();

    if (action === 'reject') {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: {
          status: CompanyReviewStatus.REJECTED,
          moderationNote: note ?? null,
          rejectedAt: now,
          rejectedByAdminId: adminUserId ?? null,
          reviewNeedsModeration: false,
        },
      });
      await this.recalculateCompanyRating(review.companyId);
      await this.syncPortalPostFromReview(reviewId, false);
      void this.sendAuthorReviewRejectedEmail(reviewId, note);
    } else if (action === 'hide') {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: {
          status: CompanyReviewStatus.HIDDEN,
          moderationNote: note ?? null,
          hiddenAt: now,
          hiddenByAdminId: adminUserId ?? null,
        },
      });
      await this.recalculateCompanyRating(review.companyId);
      await this.syncPortalPostFromReview(reviewId, false);
    } else if (action === 'remove') {
      await this.prisma.companyReview.update({
        where: { id: reviewId },
        data: {
          status: CompanyReviewStatus.REMOVED,
          moderationNote: note ?? null,
          removedAt: now,
          removedByAdminId: adminUserId ?? null,
          removalReason: removalReason ?? note ?? null,
        },
      });
      await this.recalculateCompanyRating(review.companyId);
      await this.syncPortalPostFromReview(reviewId, false);
    }

    await this.audit.log({
      action: 'MODERATION',
      message: `Recenze ${reviewId} → ${action}`,
      actorUserId: adminUserId,
      meta: { reviewId, note, removalReason },
    });

    return { ok: true, status: action };
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
      authorUserId: r.authorUser.id,
      authorName: r.authorDisplayName ?? r.authorUser.name,
      rating: r.rating,
      sentiment: r.sentiment,
      title: r.title,
      body: r.body,
      bodyPreview: r.body.slice(0, 160),
      imageCount: r.media.filter((m) => m.type === 'IMAGE' && !m.removedAt).length,
      videoCount: r.media.filter((m) => m.type === 'VIDEO' && !m.removedAt).length,
      status: r.status,
      emailVerified: r.emailVerified,
      reviewNeedsModeration: r.reviewNeedsModeration,
      editedByAuthor: r.editedByAuthor,
      editedAt: r.editedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      companyNotificationStatus: r.companyNotificationStatus,
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      reportCount: r._count.reports,
      media: r.media.filter((m) => !m.removedAt),
    }));
  }

  async getAdminReviewDetail(reviewId: string) {
    const r = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: {
        company: { select: { id: true, name: true, slug: true, ico: true } },
        authorUser: { select: { id: true, email: true, name: true, emailVerified: true } },
        media: { orderBy: { sortOrder: 'asc' } },
        post: { select: { id: true, publishedAt: true, type: true } },
        revisions: { orderBy: { createdAt: 'desc' }, take: 20 },
        _count: { select: { reports: true } },
      },
    });
    if (!r) throw new NotFoundException('Recenze nenalezena.');
    return {
      id: r.id,
      company: r.company,
      author: r.authorUser,
      authorDisplayName: r.authorDisplayName,
      rating: r.rating,
      sentiment: r.sentiment,
      title: r.title,
      body: r.body,
      status: r.status,
      emailVerified: r.emailVerified,
      reviewNeedsModeration: r.reviewNeedsModeration,
      editedByAuthor: r.editedByAuthor,
      editedAt: r.editedAt?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedByAdminId: r.approvedByAdminId,
      rejectedAt: r.rejectedAt?.toISOString() ?? null,
      hiddenAt: r.hiddenAt?.toISOString() ?? null,
      removedAt: r.removedAt?.toISOString() ?? null,
      removalReason: r.removalReason,
      moderationNote: r.moderationNote,
      companyNotificationStatus: r.companyNotificationStatus,
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      media: r.media,
      portalPost: r.post,
      revisions: r.revisions,
      reportCount: r._count.reports,
      lastApproved: r.lastApprovedBody
        ? {
            rating: r.lastApprovedRating,
            sentiment: r.lastApprovedSentiment,
            title: r.lastApprovedTitle,
            body: r.lastApprovedBody,
          }
        : null,
    };
  }

  async updateReviewAsAdmin(
    reviewId: string,
    adminUserId: string,
    input: {
      rating?: number;
      sentiment?: string;
      title?: string;
      body?: string;
      keepPublished?: boolean;
    },
  ) {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { media: true },
    });
    if (!review) throw new NotFoundException('Recenze nenalezena.');

    await this.saveRevision(review, { createdByAdminId: adminUserId });

    const rating = input.rating ?? review.rating;
    const sentiment = input.sentiment
      ? sentimentFromRating(rating, input.sentiment)
      : review.sentiment;
    const nextStatus =
      review.status === CompanyReviewStatus.PUBLISHED && input.keepPublished
        ? CompanyReviewStatus.PUBLISHED
        : CompanyReviewStatus.PENDING;

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        rating,
        sentiment,
        title: input.title?.trim() ?? review.title,
        body: input.body?.trim() ?? review.body,
        status: nextStatus,
        editedAt: new Date(),
        editedByAdminId: adminUserId,
        reviewNeedsModeration: nextStatus === CompanyReviewStatus.PENDING,
      },
    });

    if (nextStatus === CompanyReviewStatus.PUBLISHED) {
      await this.recalculateCompanyRating(review.companyId);
      await this.syncPortalPostFromReview(reviewId, true);
    }

    await this.audit.log({
      companyId: review.companyId,
      action: 'MODERATION',
      message: `Admin upravil recenzi ${reviewId}`,
      actorUserId: adminUserId,
    });

    return { ok: true, status: nextStatus };
  }

  async listMyReviews(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.emailVerified) {
      throw new ForbiddenException('Pro zobrazení recenzí je nutné ověřený email účtu.');
    }

    await this.linkReviewsToVerifiedUser(userId);

    const rows = await this.prisma.companyReview.findMany({
      where: { authorUserId: userId, status: { not: CompanyReviewStatus.REMOVED } },
      orderBy: { updatedAt: 'desc' },
      include: {
        company: { select: { id: true, name: true, slug: true } },
        media: { where: { removedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      company: r.company,
      rating: r.rating,
      sentiment: r.sentiment,
      title: r.title,
      body: r.body,
      bodyPreview: r.body.slice(0, 200),
      status: r.status,
      statusLabel: this.userStatusLabel(r),
      reviewNeedsModeration: r.reviewNeedsModeration,
      editedByAuthor: r.editedByAuthor,
      editedAt: r.editedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      mediaCount: r.media.length,
      canEdit:
        r.status !== CompanyReviewStatus.REMOVED &&
        r.status !== CompanyReviewStatus.EMAIL_VERIFICATION_REQUIRED,
    }));
  }

  async updateReviewAsAuthor(
    userId: string,
    reviewId: string,
    input: {
      rating?: number;
      sentiment?: string;
      title?: string;
      body?: string;
      media?: Array<{ type: 'IMAGE' | 'VIDEO'; url: string; thumbnailUrl?: string; mimeType?: string }>;
      removeMediaIds?: string[];
    },
  ) {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { media: true, company: true },
    });
    if (!review) throw new NotFoundException('Recenze nenalezena.');
    if (review.authorUserId !== userId) {
      throw new ForbiddenException('Tuto recenzi můžete upravovat pouze jako její autor.');
    }
    if (review.status === CompanyReviewStatus.REMOVED) {
      throw new BadRequestException('Odstraněnou recenzi nelze upravit.');
    }

    const rating = input.rating ?? review.rating;
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException('Hodnocení musí být 1–5.');
    }
    const body = input.body?.trim() ?? review.body;
    if (!body) throw new BadRequestException('Text recenze je povinný.');

    const wasPublished = review.status === CompanyReviewStatus.PUBLISHED;
    await this.saveRevision(review, { createdByUserId: userId });

    const mediaSnapshot = review.media
      .filter((m) => !m.removedAt)
      .map((m) => ({
        type: m.type,
        url: m.url,
        thumbnailUrl: m.thumbnailUrl,
      }));

    await this.prisma.$transaction(async (tx) => {
      if (wasPublished) {
        await tx.companyReview.update({
          where: { id: reviewId },
          data: {
            lastApprovedRating: review.rating,
            lastApprovedSentiment: review.sentiment,
            lastApprovedTitle: review.title,
            lastApprovedBody: review.body,
            lastApprovedMediaJson: mediaSnapshot as Prisma.InputJsonValue,
          },
        });
      }

      await tx.companyReview.update({
        where: { id: reviewId },
        data: {
          rating,
          sentiment: sentimentFromRating(rating, input.sentiment ?? review.sentiment),
          title: input.title?.trim() ?? review.title,
          body,
          status: CompanyReviewStatus.PENDING,
          reviewNeedsModeration: true,
          editedAt: new Date(),
          editedByAuthor: true,
        },
      });

      if (input.removeMediaIds?.length) {
        await tx.companyReviewMedia.updateMany({
          where: { reviewId, id: { in: input.removeMediaIds } },
          data: { removedAt: new Date(), removalReason: 'author_edit' },
        });
      }

      if (input.media?.length) {
        const maxOrder = review.media.reduce((max, m) => Math.max(max, m.sortOrder), -1);
        await tx.companyReviewMedia.createMany({
          data: input.media.map((m, idx) => ({
            reviewId,
            type: m.type,
            url: m.url,
            thumbnailUrl: m.thumbnailUrl ?? null,
            mimeType: m.mimeType ?? null,
            sortOrder: maxOrder + 1 + idx,
          })),
        });
      }
    });

    if (wasPublished) {
      await this.syncPortalPostFromReview(reviewId, false);
      await this.recalculateCompanyRating(review.companyId);
    }

    void this.sendAuthorReviewEditedPendingEmail(reviewId);

    await this.audit.log({
      companyId: review.companyId,
      action: 'REVIEW_CREATE',
      message: `Autor upravil recenzi ${reviewId} — čeká na schválení`,
      actorUserId: userId,
    });

    return { ok: true, status: CompanyReviewStatus.PENDING, reviewNeedsModeration: true };
  }

  async requestAuthorRemoval(userId: string, reviewId: string, reason?: string) {
    const review = await this.prisma.companyReview.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Recenze nenalezena.');
    if (review.authorUserId !== userId) {
      throw new ForbiddenException('Tuto recenzi můžete odstranit pouze jako její autor.');
    }

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        status: CompanyReviewStatus.REMOVED,
        removedAt: new Date(),
        removalReason: reason?.trim() || 'Na žádost autora',
      },
    });

    await this.recalculateCompanyRating(review.companyId);
    await this.syncPortalPostFromReview(reviewId, false);

    return { ok: true };
  }

  async linkReviewsToVerifiedUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user?.emailVerified) return { linked: 0 };

    const email = user.email.trim().toLowerCase();
    const shadowUsers = await this.prisma.user.findMany({
      where: {
        email,
        id: { not: userId },
        emailVerified: false,
      },
      select: { id: true },
    });

    let linked = 0;
    for (const shadow of shadowUsers) {
      const result = await this.prisma.companyReview.updateMany({
        where: { authorUserId: shadow.id },
        data: { authorUserId: userId },
      });
      linked += result.count;
    }

    return { linked };
  }

  async backfillReviewAuthors() {
    const unlinked = await this.prisma.companyReview.findMany({
      where: { authorUser: { emailVerified: true } },
      select: { id: true, authorUserId: true, authorUser: { select: { email: true } } },
      take: 500,
    });
    return { checked: unlinked.length };
  }

  private async rejectAuthorChanges(reviewId: string, adminUserId?: string, note?: string) {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { media: true },
    });
    if (!review) throw new NotFoundException('Recenze nenalezena.');
    if (!review.lastApprovedBody) {
      throw new BadRequestException('Recenze nemá uloženou schválenou verzi.');
    }

    await this.saveRevision(review, { createdByAdminId: adminUserId });

    await this.prisma.companyReview.update({
      where: { id: reviewId },
      data: {
        rating: review.lastApprovedRating ?? review.rating,
        sentiment: review.lastApprovedSentiment ?? review.sentiment,
        title: review.lastApprovedTitle ?? review.title,
        body: review.lastApprovedBody,
        status: CompanyReviewStatus.PUBLISHED,
        reviewNeedsModeration: false,
        editedByAuthor: false,
        moderationNote: note ?? null,
        lastApprovedRating: null,
        lastApprovedSentiment: null,
        lastApprovedTitle: null,
        lastApprovedBody: null,
        lastApprovedMediaJson: Prisma.JsonNull,
      },
    });

    await this.recalculateCompanyRating(review.companyId);
    await this.syncPortalPostFromReview(reviewId, true);

    await this.audit.log({
      companyId: review.companyId,
      action: 'MODERATION',
      message: `Zamítnuta nová verze recenze ${reviewId}, obnovena poslední schválená`,
      actorUserId: adminUserId,
    });

    return { ok: true, status: CompanyReviewStatus.PUBLISHED };
  }

  private userStatusLabel(review: {
    status: CompanyReviewStatus;
    reviewNeedsModeration: boolean;
    editedByAuthor: boolean;
  }) {
    if (review.reviewNeedsModeration && review.editedByAuthor) {
      return 'Upraveno – čeká na nové schválení';
    }
    switch (review.status) {
      case CompanyReviewStatus.PUBLISHED:
        return 'Publikováno';
      case CompanyReviewStatus.PENDING:
        return 'Čeká na schválení';
      case CompanyReviewStatus.REJECTED:
        return 'Zamítnuto';
      case CompanyReviewStatus.HIDDEN:
        return 'Skryto';
      case CompanyReviewStatus.EMAIL_VERIFICATION_REQUIRED:
        return 'Čeká na ověření emailu';
      default:
        return review.status;
    }
  }

  private async saveRevision(
    review: Prisma.CompanyReviewGetPayload<{ include: { media: true } }>,
    opts: { createdByUserId?: string; createdByAdminId?: string },
  ) {
    await this.prisma.companyReviewRevision.create({
      data: {
        reviewId: review.id,
        rating: review.rating,
        sentiment: review.sentiment,
        title: review.title,
        body: review.body,
        mediaSnapshot: review.media
          .filter((m) => !m.removedAt)
          .map((m) => ({
            type: m.type,
            url: m.url,
            thumbnailUrl: m.thumbnailUrl,
          })) as Prisma.InputJsonValue,
        statusAtRevision: review.status,
        createdByUserId: opts.createdByUserId ?? null,
        createdByAdminId: opts.createdByAdminId ?? null,
      },
    });
  }

  async deleteReviewMedia(mediaId: string, adminUserId?: string, reason?: string) {
    const media = await this.prisma.companyReviewMedia.findUnique({
      where: { id: mediaId },
    });
    if (!media) throw new NotFoundException('Médium nenalezeno.');
    await this.prisma.companyReviewMedia.update({
      where: { id: mediaId },
      data: {
        removedAt: new Date(),
        removedByAdminId: adminUserId ?? null,
        removalReason: reason ?? 'admin_remove',
      },
    });
    await this.audit.log({
      action: 'MODERATION',
      message: `Odstraněno médium ${mediaId} z recenze ${media.reviewId}`,
      actorUserId: adminUserId,
      meta: { mediaId, reviewId: media.reviewId, reason },
    });
    return { ok: true };
  }

  private async resolveAuthorUser(email: string, displayName?: string) {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) return { user: existing, created: false };

    const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: displayName?.trim() || email.split('@')[0] || 'Uživatel',
          emailVerified: false,
        },
      });
      return { user, created: true };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const retry = await this.prisma.user.findUnique({ where: { email } });
        if (retry) return { user: retry, created: false };
      }
      throw err;
    }
  }

  private async sendReviewAuthorOnboardingEmail(userId: string, email: string, companyName: string) {
    try {
      const token = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { resetToken: token, resetExpires: expires },
      });
      const activateUrl = buildPasswordResetUrl(token);
      await this.emails.sendTemplatedEmail({
        type: 'company_review_author_onboarding',
        templateKey: 'custom_message',
        to: email,
        variables: {
          subject: 'Dokončete svůj účet na XXREALIT',
          bodyHtml: `Dobrý den,<br/><br/>na XXREALIT jste přidali recenzi firmy <strong>${companyName}</strong>.<br/>Pro váš email jsme vytvořili účet, ke kterému je recenze přiřazena.<br/><br/><a href="${activateUrl}">Aktivovat účet</a><br/><br/>Po aktivaci uvidíte recenzi v sekci Moje recenze.`,
          bodyText: `Dobrý den,\n\nna XXREALIT jste přidali recenzi firmy ${companyName}.\nPro váš email jsme vytvořili účet.\n\nAktivovat účet: ${activateUrl}`,
        },
      });
    } catch (err) {
      this.log.warn(
        `Review author onboarding email failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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

  private async syncPortalPostFromReview(reviewId: string, visible: boolean): Promise<string | null> {
    const review = await this.prisma.companyReview.findUnique({
      where: { id: reviewId },
      include: { company: true, media: true, authorUser: true },
    });
    if (!review) return null;

    const existing = await this.prisma.post.findFirst({
      where: { companyReviewId: review.id },
      include: { media: true },
    });

    if (!visible) {
      if (existing) {
        await this.prisma.post.update({
          where: { id: existing.id },
          data: { publishedAt: null },
        });
      }
      return existing?.id ?? null;
    }

    const payload = this.buildPortalPostPayload(review);
    if (existing) {
      await this.prisma.post.update({
        where: { id: existing.id },
        data: {
          ...payload,
          publishedAt: review.publishedAt ?? new Date(),
        },
      });
      return existing.id;
    }

    const post = await this.prisma.post.create({
      data: {
        userId: review.authorUserId,
        ...payload,
        type: 'COMPANY_REVIEW',
        category: mapCompanyCategoryToPostCategory(review.company.categories[0]),
        companyDirectoryId: review.company.id,
        companyReviewId: review.id,
        publishedAt: review.publishedAt ?? new Date(),
        media:
          review.media.filter((m) => !m.removedAt).length > 0
            ? {
                create: review.media
                  .filter((m) => !m.removedAt)
                  .map((m, idx) => ({
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

  private buildPortalPostPayload(
    review: Prisma.CompanyReviewGetPayload<{
      include: { company: true; media: true; authorUser: true };
    }>,
  ) {
    const company = review.company;
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const sentimentLabel =
      review.sentiment === CompanyReviewSentiment.POSITIVE
        ? 'Pozitivní zkušenost'
        : review.sentiment === CompanyReviewSentiment.NEGATIVE
          ? 'Negativní zkušenost'
          : 'Neutrální zkušenost';

    const authorName = review.authorDisplayName ?? review.authorUser.name ?? 'Uživatel';
    const activeMedia = review.media.filter((m) => !m.removedAt);
    return {
      title: `${authorName} ohodnotil firmu ${company.name}`,
      description: `${stars}\n\n${sentimentLabel}\n\n${review.body.slice(0, 280)}`,
      content: review.body,
      imageUrl: activeMedia.find((m) => m.type === 'IMAGE')?.url ?? null,
      videoUrl: activeMedia.find((m) => m.type === 'VIDEO')?.url ?? null,
      city: company.city ?? '',
    };
  }

  private async sendAuthorReviewPendingEmail(reviewId: string) {
    await this.sendAuthorEmailSafe(reviewId, 'pending');
  }

  private async sendAuthorReviewPublishedEmail(reviewId: string) {
    await this.sendAuthorEmailSafe(reviewId, 'published');
  }

  private async sendAuthorReviewRejectedEmail(reviewId: string, note?: string) {
    await this.sendAuthorEmailSafe(reviewId, 'rejected', note);
  }

  private async sendAuthorReviewEditedPendingEmail(reviewId: string) {
    await this.sendAuthorEmailSafe(reviewId, 'edited_pending');
  }

  private async sendAuthorEmailSafe(
    reviewId: string,
    kind: 'pending' | 'published' | 'rejected' | 'edited_pending',
    note?: string,
  ) {
    try {
      const review = await this.prisma.companyReview.findUnique({
        where: { id: reviewId },
        include: { authorUser: true, company: true },
      });
      if (!review?.authorUser?.email) return;

      const reviewUrl = `${resolveFrontendUrl()}/firmy/${review.company.slug}#review-${review.id}`;
      const editUrl = `${resolveFrontendUrl()}/profil/recenze`;
      const subjects: Record<typeof kind, string> = {
        pending: 'Vaše recenze čeká na schválení',
        published: 'Vaše recenze byla zveřejněna',
        rejected: 'Vaše recenze zatím nebyla zveřejněna',
        edited_pending: 'Vaše upravená recenze čeká na kontrolu',
      };
      const bodies: Record<typeof kind, string> = {
        pending: `Dobrý den,\n\nvaše recenze firmy ${review.company.name} byla ověřena a čeká na schválení administrátorem.\n\n${reviewUrl}`,
        published: `Dobrý den,\n\nvaše recenze firmy ${review.company.name} byla zveřejněna.\n\nZobrazit recenzi: ${reviewUrl}`,
        rejected: `Dobrý den,\n\nvaše recenze firmy ${review.company.name} zatím nebyla zveřejněna.${note ? `\n\nDůvod: ${note}` : ''}\n\nUpravit recenzi: ${editUrl}`,
        edited_pending: `Dobrý den,\n\nvaše upravená recenze firmy ${review.company.name} čeká na kontrolu administrátorem.\n\n${editUrl}`,
      };

      await this.emails.sendTemplatedEmail({
        type: `company_review_${kind}`,
        templateKey: 'custom_message',
        to: review.authorUser.email,
        variables: {
          subject: subjects[kind],
          bodyHtml: bodies[kind].replace(/\n/g, '<br/>'),
          bodyText: bodies[kind],
        },
      });
    } catch (err) {
      this.log.warn(
        `Author review email (${kind}) failed for ${reviewId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
