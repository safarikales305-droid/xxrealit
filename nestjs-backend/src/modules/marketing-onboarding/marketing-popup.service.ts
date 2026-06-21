import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CreateMarketingPopupDto } from './dto/create-marketing-popup.dto';
import { UpdateMarketingPopupDto } from './dto/update-marketing-popup.dto';

export type MarketingPopupButton = { label: string; href: string };

export type MarketingPopupRow = {
  id: string;
  name: string;
  title: string;
  body: string;
  imageUrl: string | null;
  videoUrl: string | null;
  buttons: MarketingPopupButton[];
  targetRoles: string[];
  triggers: string[];
  isEnabled: boolean;
  sortOrder: number;
};

export type OnboardingUserContext = {
  role: string;
  emailVerified: boolean;
  whatsappVerified: boolean;
  isTipar: boolean;
  profileComplete: boolean;
  isPwaInstalled: boolean;
  justRegistered: boolean;
  justLoggedIn: boolean;
};

@Injectable()
export class MarketingPopupService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: {
    id: string;
    name: string;
    title: string;
    body: string;
    imageUrl: string | null;
    videoUrl: string | null;
    buttons: unknown;
    targetRoles: string[];
    triggers: string[];
    isEnabled: boolean;
    sortOrder: number;
  }): MarketingPopupRow {
    const buttons = Array.isArray(row.buttons)
      ? (row.buttons as MarketingPopupButton[]).filter(
          (b) => b && typeof b.label === 'string' && typeof b.href === 'string',
        )
      : [];
    return {
      id: row.id,
      name: row.name,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl,
      videoUrl: row.videoUrl,
      buttons,
      targetRoles: row.targetRoles ?? [],
      triggers: row.triggers ?? [],
      isEnabled: row.isEnabled,
      sortOrder: row.sortOrder,
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
          targetRoles: dto.targetRoles ?? [],
          triggers: dto.triggers ?? [],
          isEnabled: dto.isEnabled ?? false,
          sortOrder: dto.sortOrder ?? 0,
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
        ...(dto.buttons !== undefined
          ? { buttons: dto.buttons as Prisma.InputJsonValue }
          : {}),
        ...(dto.targetRoles !== undefined ? { targetRoles: dto.targetRoles } : {}),
        ...(dto.triggers !== undefined ? { triggers: dto.triggers } : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    return this.serialize(row);
  }

  async delete(id: string) {
    await this.prisma.marketingPopup.delete({ where: { id } });
    return { ok: true };
  }

  listEligible(ctx: OnboardingUserContext): Promise<MarketingPopupRow[]> {
    return this.prisma.marketingPopup
      .findMany({
        where: { isEnabled: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      })
      .then((rows) =>
        rows
          .map((r) => this.serialize(r))
          .filter((popup) => this.matchesPopup(popup, ctx)),
      );
  }

  private matchesPopup(popup: MarketingPopupRow, ctx: OnboardingUserContext): boolean {
    if (popup.targetRoles.length > 0) {
      const role = ctx.role.toUpperCase();
      if (!popup.targetRoles.map((r) => r.toUpperCase()).includes(role)) return false;
    }

    if (popup.triggers.length === 0) return false;

    return popup.triggers.some((trigger) => {
      switch (trigger) {
        case 'AFTER_REGISTER':
          return ctx.justRegistered;
        case 'AFTER_LOGIN':
          return ctx.justLoggedIn;
        case 'MISSING_WHATSAPP':
          return !ctx.whatsappVerified;
        case 'MISSING_EMAIL':
          return !ctx.emailVerified;
        case 'MISSING_PROFILE':
          return !ctx.profileComplete;
        case 'TIPSTER_OFFER':
          return !ctx.isTipar;
        case 'PWA_INSTALL':
          return ctx.isPwaInstalled;
        default:
          return false;
      }
    });
  }
}
