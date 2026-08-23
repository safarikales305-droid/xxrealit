import { Injectable, Logger, OnModuleInit, BadRequestException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { ProfileImagesService } from '../upload/profile-images.service';
import { ProfileMediaStorageService } from '../upload/profile-media-storage.service';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcrypt');

export const AI_EDITOR_SYSTEM_EMAIL = 'ai-redakce@system.xxrealit.cz';
export const AI_EDITOR_SYSTEM_ROLE = 'AI_EDITOR';
export const AI_EDITOR_DEFAULT_NAME = 'AI redakce XXrealit';
export const AI_EDITOR_DEFAULT_BIO =
  'Automatická redakce portálu XXrealit přinášející aktuality z realitního trhu, financí, stavebnictví a souvisejících oblastí.';
export const AI_EDITOR_DEFAULT_AVATAR = '/images/aktuality-default-og.svg';

export type SystemAuthorStatus = {
  ok: boolean;
  errorCode?: 'SYSTEM_USER_NOT_FOUND' | 'SYSTEM_USER_CREATE_FAILED';
  error?: string;
  userId: string | null;
  name: string | null;
  email: string | null;
  avatar: string | null;
  bio: string | null;
  publicProfile: boolean;
  publishedArticles: number;
  publishedVideos: number;
  publishedPosts: number;
  lastPublishedAt: string | null;
};

export type SystemAuthorProfilePatch = {
  name?: string;
  bio?: string | null;
  avatar?: string | null;
};

@Injectable()
export class NewsSystemUserService implements OnModuleInit {
  private readonly log = new Logger(NewsSystemUserService.name);
  private cachedUserId: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: NewsEditorialSettingsService,
    private readonly profileImages: ProfileImagesService,
    private readonly profileMediaStorage: ProfileMediaStorageService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSystemUser();
      this.log.log('AI redakce systémový uživatel připraven');
    } catch (err) {
      this.log.error(
        `AI redakce systémový uživatel se nepodařilo připravit: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }

  private async hashRandomPassword(): Promise<string> {
    return bcrypt.hash(randomBytes(48).toString('hex'), 12);
  }

  private displayNameFromSettings(): string {
    const label = this.settings.getCached()?.portalPostAuthorLabel?.trim();
    return label || AI_EDITOR_DEFAULT_NAME;
  }

  async ensureSystemUser(): Promise<User> {
    const envId = process.env.PORTAL_SYSTEM_USER_ID?.trim();
    if (envId) {
      const byEnv = await this.prisma.user.findUnique({ where: { id: envId } });
      if (byEnv) {
        this.cachedUserId = byEnv.id;
        return byEnv;
      }
      this.log.warn(
        `PORTAL_SYSTEM_USER_ID=${envId} neexistuje — použiji automatický systémový účet AI redakce`,
      );
    }

    const byRole = await this.prisma.user.findFirst({
      where: { isSystemUser: true, systemRole: AI_EDITOR_SYSTEM_ROLE },
      orderBy: { createdAt: 'asc' },
    });
    if (byRole) {
      this.cachedUserId = byRole.id;
      return byRole;
    }

    const byEmail = await this.prisma.user.findUnique({
      where: { email: AI_EDITOR_SYSTEM_EMAIL },
    });
    if (byEmail) {
      const updated = await this.prisma.user.update({
        where: { id: byEmail.id },
        data: {
          isSystemUser: true,
          systemRole: AI_EDITOR_SYSTEM_ROLE,
          publicProfile: true,
          canPublishPosts: true,
          emailVerified: true,
          name: byEmail.name?.trim() ? byEmail.name : this.displayNameFromSettings(),
        },
      });
      this.cachedUserId = updated.id;
      return updated;
    }

    const password = await this.hashRandomPassword();
    const created = await this.prisma.user.create({
      data: {
        email: AI_EDITOR_SYSTEM_EMAIL,
        password,
        name: this.displayNameFromSettings(),
        role: UserRole.USER,
        isSystemUser: true,
        systemRole: AI_EDITOR_SYSTEM_ROLE,
        publicProfile: true,
        canPublishPosts: true,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        bio: AI_EDITOR_DEFAULT_BIO,
        avatar: AI_EDITOR_DEFAULT_AVATAR,
      },
    });
    this.cachedUserId = created.id;
    this.log.log(`Vytvořen systémový uživatel AI redakce (${created.id})`);
    return created;
  }

  async getSystemUserId(): Promise<string> {
    if (this.cachedUserId) {
      const exists = await this.prisma.user.findUnique({
        where: { id: this.cachedUserId },
        select: { id: true },
      });
      if (exists) return this.cachedUserId;
      this.cachedUserId = null;
    }
    const user = await this.ensureSystemUser();
    return user.id;
  }

  async getSystemUser(): Promise<User> {
    const id = await this.getSystemUserId();
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('SYSTEM_USER_NOT_FOUND');
    return user;
  }

  async getSystemAuthorStatus(): Promise<SystemAuthorStatus> {
    try {
      const user = await this.getSystemUser();
      const [publishedArticles, publishedVideos, publishedPosts, lastPost] = await Promise.all([
        this.prisma.newsArticle.count({
          where: { status: 'PUBLISHED' },
        }),
        this.prisma.post.count({ where: { userId: user.id, type: 'YOUTUBE_VIDEO' } }),
        this.prisma.post.count({
          where: { userId: user.id, publishedAt: { not: null } },
        }),
        this.prisma.post.findFirst({
          where: { userId: user.id, publishedAt: { not: null } },
          orderBy: { publishedAt: 'desc' },
          select: { publishedAt: true },
        }),
      ]);

      return {
        ok: true,
        userId: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        bio: user.bio,
        publicProfile: user.publicProfile,
        publishedArticles,
        publishedVideos,
        publishedPosts,
        lastPublishedAt: lastPost?.publishedAt?.toISOString() ?? null,
      };
    } catch (err) {
      return {
        ok: false,
        errorCode: 'SYSTEM_USER_NOT_FOUND',
        error: err instanceof Error ? err.message : String(err),
        userId: null,
        name: null,
        email: null,
        avatar: null,
        bio: null,
        publicProfile: false,
        publishedArticles: 0,
        publishedVideos: 0,
        publishedPosts: 0,
        lastPublishedAt: null,
      };
    }
  }

  async updateSystemAuthorProfile(patch: SystemAuthorProfilePatch): Promise<SystemAuthorStatus> {
    const user = await this.getSystemUser();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        ...(patch.name != null ? { name: patch.name.trim() } : {}),
        ...(patch.bio !== undefined ? { bio: patch.bio } : {}),
        ...(patch.avatar !== undefined ? { avatar: patch.avatar || AI_EDITOR_DEFAULT_AVATAR } : {}),
      },
    });
    return this.getSystemAuthorStatus();
  }

  async uploadSystemAuthorAvatar(
    file: Express.Multer.File,
  ): Promise<SystemAuthorStatus> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor nebyl přijat.');
    }
    const user = await this.getSystemUser();
    await this.profileImages.validateRasterInput(file.buffer, file.mimetype, file.originalname);
    const { buffer, ext } = await this.profileImages.processAvatarForUpload(file.buffer);
    let avatarUrl: string;
    if (this.profileMediaStorage.isRemotePersistent()) {
      avatarUrl = await this.profileMediaStorage.uploadAvatar(user.id, buffer);
    } else {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { join } = await import('node:path');
      const { getUploadsPath } = await import('../../lib/uploads-path');
      const dir = join(getUploadsPath(), 'avatars');
      mkdirSync(dir, { recursive: true });
      const name = `system-${user.id}-${Date.now()}${ext}`;
      writeFileSync(join(dir, name), buffer);
      avatarUrl = `/uploads/avatars/${name}`;
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatar: avatarUrl },
    });
    return this.getSystemAuthorStatus();
  }

  async clearSystemAuthorAvatar(): Promise<SystemAuthorStatus> {
    const user = await this.getSystemUser();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { avatar: AI_EDITOR_DEFAULT_AVATAR },
    });
    return this.getSystemAuthorStatus();
  }
}
