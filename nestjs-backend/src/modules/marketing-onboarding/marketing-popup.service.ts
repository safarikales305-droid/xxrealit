import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateMarketingPopupDto } from './dto/create-marketing-popup.dto';
import { UpdateMarketingPopupDto } from './dto/update-marketing-popup.dto';
import { SYSTEM_MARKETING_POPUPS } from './marketing-popup.defaults';

export type MarketingPopupButton = { label: string; href: string };

export type MarketingPopupRow = {
  id: string;
  slug: string | null;
  name: string;
  title: string;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  buttons: MarketingPopupButton[];
  linkUrl: string | null;
  targetRoles: string[];
  excludeRoles: string[];
  triggers: string[];
  profileTriggers: string[];
  isEnabled: boolean;
  sortOrder: number;
  maxViewsPerUser: number;
  repeatAfterDays: number | null;
  displayCount: number;
  isSystem: boolean;
  variant: string;
};

export type OnboardingUserContext = {
  userId: string;
  role: string;
  emailVerified: boolean;
  whatsappVerified: boolean;
  hasPhone: boolean;
  hasAvatar: boolean;
  isTipar: boolean;
  profileComplete: boolean;
  isPwaInstalled: boolean;
  justRegistered: boolean;
  justLoggedIn: boolean;
  onWorkerPanel: boolean;
  workerOnboardingIncomplete: boolean;
  hasBankAccount: boolean;
};

@Injectable()
export class MarketingPopupService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureSystemPopups();
  }

  async ensureSystemPopups() {
    for (const seed of SYSTEM_MARKETING_POPUPS) {
      await this.prisma.marketingPopup.upsert({
        where: { slug: seed.slug },
        create: {
          slug: seed.slug,
          name: seed.name,
          title: seed.title,
          body: seed.body,
          imageUrl: seed.imageUrl ?? null,
          videoUrl: seed.videoUrl ?? null,
          buttons: seed.buttons as Prisma.InputJsonValue,
          linkUrl: seed.linkUrl ?? null,
          targetRoles: seed.targetRoles,
          excludeRoles: seed.excludeRoles,
          triggers: seed.triggers,
          profileTriggers: seed.profileTriggers,
          isEnabled: seed.isEnabled,
          sortOrder: seed.sortOrder,
          maxViewsPerUser: seed.maxViewsPerUser,
          repeatAfterDays: seed.repeatAfterDays,
          isSystem: true,
          variant: seed.variant,
          config: seed.config ?? undefined,
        },
        update: {
          isSystem: true,
          variant: seed.variant,
          ...(seed.slug === 'tipster-offer' ? { excludeRoles: seed.excludeRoles } : {}),
        },
      });
    }
  }

  private serialize(row: {
    id: string;
    slug: string | null;
    name: string;
    title: string;
    body: string;
    imageUrl: string | null;
    videoUrl: string | null;
    buttons: unknown;
    linkUrl: string | null;
    targetRoles: string[];
    excludeRoles: string[];
    triggers: string[];
    profileTriggers: string[];
    isEnabled: boolean;
    sortOrder: number;
    maxViewsPerUser: number;
    repeatAfterDays: number | null;
    displayCount: number;
    isSystem: boolean;
    variant: string;
  }): MarketingPopupRow {
    const buttons = Array.isArray(row.buttons)
      ? (row.buttons as MarketingPopupButton[]).filter(
          (b) => b && typeof b.label === 'string' && typeof b.href === 'string',
        )
      : [];
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl,
      videoUrl: row.videoUrl,
      buttons,
      linkUrl: row.linkUrl,
      targetRoles: row.targetRoles ?? [],
      excludeRoles: row.excludeRoles ?? [],
      triggers: row.triggers ?? [],
      profileTriggers: row.profileTriggers ?? [],
      isEnabled: row.isEnabled,
      sortOrder: row.sortOrder,
      maxViewsPerUser: row.maxViewsPerUser,
      repeatAfterDays: row.repeatAfterDays,
      displayCount: row.displayCount,
      isSystem: row.isSystem,
      variant: row.variant,
    };
  }

  listAdmin() {
    return this.prisma.marketingPopup
      .findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] })
      .then((rows) => rows.map((r) => this.serialize(r)));
  }

  create(dto: CreateMarketingPopupDto) {
    return this.prisma.marketingPopup
      .create({
        data: {
          name: dto.name.trim(),
          title: dto.title.trim(),
          body: dto.body,
          imageUrl: dto.imageUrl?.trim() || null,
          videoUrl: dto.videoUrl?.trim() || null,
          buttons: (dto.buttons ?? []) as Prisma.InputJsonValue,
          linkUrl: dto.linkUrl?.trim() || null,
          targetRoles: dto.targetRoles ?? [],
          excludeRoles: dto.excludeRoles ?? [],
          triggers: dto.triggers ?? [],
          profileTriggers: dto.profileTriggers ?? [],
          isEnabled: dto.isEnabled ?? false,
          sortOrder: dto.sortOrder ?? 0,
          maxViewsPerUser: dto.maxViewsPerUser ?? 1,
          repeatAfterDays: dto.repeatAfterDays ?? null,
          variant: dto.variant?.trim() || 'modal',
        },
      })
      .then((r) => this.serialize(r));
  }

  async update(id: string, dto: UpdateMarketingPopupDto) {
    const row = await this.prisma.marketingPopup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.body !== undefined ? { body: dto.body } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl?.trim() || null } : {}),
        ...(dto.videoUrl !== undefined ? { videoUrl: dto.videoUrl?.trim() || null } : {}),
        ...(dto.buttons !== undefined ? { buttons: dto.buttons as Prisma.InputJsonValue } : {}),
        ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl?.trim() || null } : {}),
        ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
        ...(dto.excludeRoles !== undefined ? { excludeRoles: dto.excludeRoles } : {}),
        ...(dto.triggers !== undefined ? { triggers: dto.triggers } : {}),
        ...(dto.profileTriggers !== undefined ? { profileTriggers: dto.profileTriggers } : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.maxViewsPerUser !== undefined ? { maxViewsPerUser: dto.maxViewsPerUser } : {}),
        ...(dto.repeatAfterDays !== undefined ? { repeatAfterDays: dto.repeatAfterDays } : {}),
        ...(dto.variant !== undefined ? { variant: dto.variant.trim() || 'modal' } : {}),
      },
    });
    return this.serialize(row);
  }

  async toggleEnabled(id: string) {
    const current = await this.prisma.marketingPopup.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Popup nenalezen.');
    const row = await this.prisma.marketingPopup.update({
      where: { id },
      data: { isEnabled: !current.isEnabled },
    });
    return this.serialize(row);
  }

  async delete(id: string) {
    const row = await this.prisma.marketingPopup.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Popup nenalezen.');
    if (row.isSystem) {
      await this.prisma.marketingPopup.update({
        where: { id },
        data: { isEnabled: false },
      });
      return { ok: true, disabled: true };
    }
    await this.prisma.marketingPopup.delete({ where: { id } });
    return { ok: true };
  }

  async recordView(userId: string, popupId: string) {
    const popup = await this.prisma.marketingPopup.findUnique({ where: { id: popupId } });
    if (!popup) return { ok: false };

    await this.prisma.$transaction([
      this.prisma.marketingPopupUserView.upsert({
        where: { popupId_userId: { popupId, userId } },
        create: { popupId, userId, viewCount: 1, lastShownAt: new Date() },
        update: { viewCount: { increment: 1 }, lastShownAt: new Date() },
      }),
      this.prisma.marketingPopup.update({
        where: { id: popupId },
        data: { displayCount: { increment: 1 } },
      }),
    ]);
    return { ok: true };
  }

  async listEligible(ctx: OnboardingUserContext): Promise<MarketingPopupRow[]> {
    const [rows, userViews] = await Promise.all([
      this.prisma.marketingPopup.findMany({
        where: { isEnabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.marketingPopupUserView.findMany({ where: { userId: ctx.userId } }),
    ]);
    const viewMap = new Map(userViews.map((v) => [v.popupId, v]));

    return rows
      .map((r) => this.serialize(r))
      .filter((popup) => this.matchesPopup(popup, ctx))
      .filter((popup) => this.canShowToUser(popup, viewMap.get(popup.id)));
  }

  getBySlug(slug: string) {
    return this.prisma.marketingPopup
      .findUnique({ where: { slug } })
      .then((r) => (r ? this.serialize(r) : null));
  }

  private canShowToUser(
    popup: MarketingPopupRow,
    view?: { viewCount: number; lastShownAt: Date },
  ): boolean {
    if (!view) return true;
    if (popup.repeatAfterDays != null && popup.repeatAfterDays > 0) {
      const daysSince =
        (Date.now() - view.lastShownAt.getTime()) / (24 * 60 * 60 * 1000);
      if (daysSince >= popup.repeatAfterDays) return true;
    }
    if (popup.maxViewsPerUser <= 0) return true;
    return view.viewCount < popup.maxViewsPerUser;
  }

  private matchesPopup(popup: MarketingPopupRow, ctx: OnboardingUserContext): boolean {
    const role = ctx.role.toUpperCase();

    if (popup.excludeRoles.length > 0) {
      const excluded = popup.excludeRoles.map((r) => r.toUpperCase());
      if (excluded.includes(role)) return false;
    }

    if (popup.targetRoles.length > 0) {
      if (!popup.targetRoles.map((r) => r.toUpperCase()).includes(role)) return false;
    }

    if (popup.triggers.length === 0) return false;

    const guestVariants = new Set(['guest_gate', 'inline_overlay', 'share_gate']);
    if (guestVariants.has(popup.variant)) return false;

    return popup.triggers.some((trigger) => this.matchesTrigger(trigger, popup, ctx));
  }

  private matchesTrigger(
    trigger: string,
    popup: MarketingPopupRow,
    ctx: OnboardingUserContext,
  ): boolean {
    switch (trigger) {
      case 'AFTER_REGISTER':
        return ctx.justRegistered;
      case 'AFTER_LOGIN':
        return ctx.justLoggedIn;
      case 'MISSING_WHATSAPP':
        return !ctx.whatsappVerified;
      case 'MISSING_EMAIL':
        return !ctx.emailVerified;
      case 'MISSING_PHONE':
        return !ctx.hasPhone;
      case 'MISSING_AVATAR':
        return !ctx.hasAvatar;
      case 'MISSING_PROFILE':
        return !ctx.profileComplete;
      case 'MISSING_BANK_ACCOUNT':
        return !ctx.hasBankAccount;
      case 'TIPSTER_OFFER':
        return !ctx.isTipar;
      case 'PWA_INSTALL':
        return !ctx.isPwaInstalled;
      case 'PWA_PUSH':
        return ctx.isPwaInstalled;
      case 'PORTAL_WORKER_PANEL':
        return ctx.onWorkerPanel && ctx.workerOnboardingIncomplete;
      default:
        return false;
    }
  }
}
