import { BadRequestException, Inject, Injectable, forwardRef } from '@nestjs/common';
import type { RegistrationGateSetting } from '@prisma/client';
import { extname } from 'node:path';
import { PrismaService } from '../../database/prisma.service';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';
import { UpdateRegistrationGateDto } from './dto/update-registration-gate.dto';

const SETTINGS_ID = 'default';
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const DEFAULTS = {
  requireFirstContent: false,
  shortsGateEnabled: false,
  shortsGateAfterViews: 4,
  gateType: 'BANNER',
  title: 'Založte si účet na XXrealit',
  description: 'Inzerujte, tipujte a vydělávejte s portálem XXrealit.',
  buttonText: 'Založit účet',
  videoUrl: null as string | null,
  bannerImageUrl: null as string | null,
  skipAfterSeconds: 5,
  emailSignupEnabled: false,
  emailSignupAfterViews: 10,
  emailSignupTitle: 'Připojte se k XXREALIT',
  emailSignupDescription: 'Sledujte reality, videa a novinky na jednom místě.',
  emailSignupButtonText: 'Pokračovat',
  emailSignupDismissText: 'Nechci registraci',
  emailSignupDismissCooldownDays: 7,
};

@Injectable()
export class RegistrationGateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => PropertyMediaCloudinaryService))
    private readonly cloudinary: PropertyMediaCloudinaryService,
  ) {}

  private serialize(row: RegistrationGateSetting) {
    return {
      id: row.id,
      requireFirstContent: row.requireFirstContent,
      shortsGateEnabled: row.shortsGateEnabled,
      shortsGateAfterViews: row.shortsGateAfterViews,
      gateType: row.gateType,
      title: row.title,
      description: row.description,
      buttonText: row.buttonText,
      videoUrl: upgradeHttpToHttpsForApi(row.videoUrl) ?? row.videoUrl,
      bannerImageUrl: upgradeHttpToHttpsForApi(row.bannerImageUrl) ?? row.bannerImageUrl,
      skipAfterSeconds: row.skipAfterSeconds,
      emailSignupEnabled: row.emailSignupEnabled,
      emailSignupAfterViews: row.emailSignupAfterViews,
      emailSignupTitle: row.emailSignupTitle,
      emailSignupDescription: row.emailSignupDescription,
      emailSignupButtonText: row.emailSignupButtonText,
      emailSignupDismissText: row.emailSignupDismissText,
      emailSignupDismissCooldownDays: row.emailSignupDismissCooldownDays,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private serializePublic(row: RegistrationGateSetting) {
    return {
      shortsGateEnabled: row.shortsGateEnabled,
      shortsGateAfterViews: row.shortsGateAfterViews,
      gateType: row.gateType,
      title: row.title,
      description: row.description,
      buttonText: row.buttonText,
      videoUrl: upgradeHttpToHttpsForApi(row.videoUrl) ?? row.videoUrl,
      bannerImageUrl: upgradeHttpToHttpsForApi(row.bannerImageUrl) ?? row.bannerImageUrl,
      skipAfterSeconds: row.skipAfterSeconds,
    };
  }

  async getOrCreate(): Promise<RegistrationGateSetting> {
    const existing = await this.prisma.registrationGateSetting.findUnique({
      where: { id: SETTINGS_ID },
    });
    if (existing) return existing;
    return this.prisma.registrationGateSetting.create({
      data: { id: SETTINGS_ID, ...DEFAULTS },
    });
  }

  async getAdminSettings() {
    const row = await this.getOrCreate();
    return this.serialize(row);
  }

  async getEmailSignupPublicSettings() {
    const row = await this.getOrCreate();
    if (!row.emailSignupEnabled) return null;
    return {
      enabled: true,
      afterViews: row.emailSignupAfterViews,
      title: row.emailSignupTitle,
      description: row.emailSignupDescription,
      buttonText: row.emailSignupButtonText,
      dismissText: row.emailSignupDismissText,
      dismissCooldownDays: row.emailSignupDismissCooldownDays,
      variantId: `trigger_${row.emailSignupAfterViews}`,
    };
  }

  async getPublicSettings() {
    const row = await this.getOrCreate();
    if (!row.shortsGateEnabled) return null;
    return this.serializePublic(row);
  }

  async getRequireFirstContent(): Promise<boolean> {
    const row = await this.getOrCreate();
    return row.requireFirstContent;
  }

  async updateSettings(dto: UpdateRegistrationGateDto) {
    await this.getOrCreate();
    const updated = await this.prisma.registrationGateSetting.update({
      where: { id: SETTINGS_ID },
      data: {
        ...(dto.requireFirstContent !== undefined
          ? { requireFirstContent: dto.requireFirstContent }
          : {}),
        ...(dto.shortsGateEnabled !== undefined
          ? { shortsGateEnabled: dto.shortsGateEnabled }
          : {}),
        ...(dto.shortsGateAfterViews !== undefined
          ? { shortsGateAfterViews: Math.max(1, Math.trunc(dto.shortsGateAfterViews)) }
          : {}),
        ...(dto.gateType !== undefined ? { gateType: dto.gateType } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
        ...(dto.buttonText !== undefined ? { buttonText: dto.buttonText.trim() } : {}),
        ...(dto.videoUrl !== undefined
          ? { videoUrl: dto.videoUrl?.trim() || null }
          : {}),
        ...(dto.bannerImageUrl !== undefined
          ? { bannerImageUrl: dto.bannerImageUrl?.trim() || null }
          : {}),
        ...(dto.skipAfterSeconds !== undefined
          ? { skipAfterSeconds: Math.max(0, Math.min(120, Math.trunc(dto.skipAfterSeconds))) }
          : {}),
        ...(dto.emailSignupEnabled !== undefined
          ? { emailSignupEnabled: dto.emailSignupEnabled }
          : {}),
        ...(dto.emailSignupAfterViews !== undefined
          ? { emailSignupAfterViews: Math.max(1, Math.min(100, Math.trunc(dto.emailSignupAfterViews))) }
          : {}),
        ...(dto.emailSignupTitle !== undefined
          ? { emailSignupTitle: dto.emailSignupTitle.trim() }
          : {}),
        ...(dto.emailSignupDescription !== undefined
          ? { emailSignupDescription: dto.emailSignupDescription.trim() }
          : {}),
        ...(dto.emailSignupButtonText !== undefined
          ? { emailSignupButtonText: dto.emailSignupButtonText.trim() }
          : {}),
        ...(dto.emailSignupDismissText !== undefined
          ? { emailSignupDismissText: dto.emailSignupDismissText.trim() }
          : {}),
        ...(dto.emailSignupDismissCooldownDays !== undefined
          ? {
              emailSignupDismissCooldownDays: Math.max(
                1,
                Math.min(90, Math.trunc(dto.emailSignupDismissCooldownDays)),
              ),
            }
          : {}),
      },
    });
    return this.serialize(updated);
  }

  async uploadVideo(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nahrajte video (pole video).');
    }
    if (file.size > MAX_VIDEO_BYTES) {
      throw new BadRequestException('Video je příliš velké (max 120 MB).');
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!['.mp4', '.webm', '.mov'].includes(ext)) {
      throw new BadRequestException('Povolené formáty: MP4, WebM, MOV.');
    }
    const videoUrl = await this.cloudinary.uploadVideo(file);
    await this.getOrCreate();
    const updated = await this.prisma.registrationGateSetting.update({
      where: { id: SETTINGS_ID },
      data: { videoUrl, gateType: 'VIDEO' },
    });
    return this.serialize(updated);
  }

  async uploadBanner(file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Nahrajte obrázek (pole banner).');
    }
    if (file.size > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Obrázek je příliš velký (max 8 MB).');
    }
    const ext = extname(file.originalname || '').toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      throw new BadRequestException('Povolené formáty: JPG, PNG, WebP.');
    }
    const bannerImageUrl = await this.cloudinary.uploadImage(file);
    await this.getOrCreate();
    const updated = await this.prisma.registrationGateSetting.update({
      where: { id: SETTINGS_ID },
      data: { bannerImageUrl },
    });
    return this.serialize(updated);
  }

  async markFirstContentCompleted(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { firstContentCompleted: true },
    });
  }

  /** Pokud už má inzerát/tip, doplní firstContentCompleted (starší účty). */
  async syncFirstContentStatus(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstContentCompleted: true },
    });
    if (!user || user.firstContentCompleted) return true;

    const [listingCount, tipCount] = await Promise.all([
      this.prisma.property.count({ where: { userId, deletedAt: null } }),
      this.prisma.tiparPost.count({ where: { userId, deletedAt: null } }),
    ]);

    if (listingCount > 0 || tipCount > 0) {
      await this.markFirstContentCompleted(userId);
      return true;
    }
    return false;
  }
}
