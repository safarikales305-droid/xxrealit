import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { UserRole } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import { TokenEncryptionService } from '../token-encryption.service';
import {
  DEFAULT_FACEBOOK_AUTOPOST,
  DEFAULT_PLATFORM_PLACEHOLDER,
  DEFAULT_SOCIAL_AUTOPOST_GLOBAL,
  DEFAULT_SOCIAL_AUTOPOST_SETTINGS,
  DEFAULT_INSTAGRAM_AUTOPOST,
  maskAccessToken,
  type FacebookAutopostSettings,
  type InstagramAutopostSettings,
  type PlatformPlaceholderSettings,
  type SocialApiLogEntry,
  type SocialAutopostGlobalSettings,
  type SocialAutopostSettings,
  type SocialAutopostSettingsPublic,
} from './social-autopost.types';

const SETTINGS_KEY = 'social_autopost_settings';
const MAX_API_LOGS = 30;

@Injectable()
export class SocialAutopostSettingsService implements OnModuleInit {
  private readonly logger = new Logger(SocialAutopostSettingsService.name);
  private stored: SocialAutopostSettings = { ...DEFAULT_SOCIAL_AUTOPOST_SETTINGS };

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokenEncryption: TokenEncryptionService,
  ) {}

  async onModuleInit() {
    await this.reload();
  }

  private str(v: unknown, fallback = ''): string {
    return typeof v === 'string' ? v.trim() : fallback;
  }

  private roles(v: unknown): UserRole[] {
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is UserRole => typeof x === 'string');
  }

  private platformSettings(
    raw: unknown,
    fallback: PlatformPlaceholderSettings,
  ): PlatformPlaceholderSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    return {
      enabled: o.enabled === true,
      publishListings: o.publishListings === true,
      publishPosts: o.publishPosts === true,
      publishShortsAsReels: o.publishShortsAsReels === true,
      repeatPublishing: o.repeatPublishing === true,
      preparedForFuture: o.preparedForFuture !== false,
    };
  }

  private instagramSettings(raw: unknown) {
    const base = this.platformSettings(raw, DEFAULT_INSTAGRAM_AUTOPOST);
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return {
      ...base,
      preparedForFuture: false,
      instagramBusinessId: str(o.instagramBusinessId),
      instagramUsername: str(o.instagramUsername),
      instagramName: str(o.instagramName),
      profilePictureUrl: str(o.profilePictureUrl),
      linkedPageId: str(o.linkedPageId),
      linkedPageName: str(o.linkedPageName),
      connected: o.connected === true,
      lastSyncedAt:
        o.lastSyncedAt === null || typeof o.lastSyncedAt === 'string'
          ? (o.lastSyncedAt as string | null)
          : null,
    };
  }

  private num(v: unknown, fallback: number, min: number, max: number): number {
    const n = typeof v === 'number' ? v : Number.parseInt(String(v ?? ''), 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
  }

  private globalSettings(raw: unknown): SocialAutopostGlobalSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_SOCIAL_AUTOPOST_GLOBAL;
    return {
      autoPublishNewListings: o.autoPublishNewListings !== false,
      autoPublishNewPosts: o.autoPublishNewPosts !== false,
      publishShortsAsReels: o.publishShortsAsReels !== false,
      publishClassicAsPhotoPost: o.publishClassicAsPhotoPost !== false,
      hidePublicPrice: o.hidePublicPrice !== false,
      repeatPublishingEnabled: o.repeatPublishingEnabled !== false,
      videoTeaserMaxSeconds: this.num(o.videoTeaserMaxSeconds, d.videoTeaserMaxSeconds, 1, 60),
      videoTeaserEndSlideText:
        typeof o.videoTeaserEndSlideText === 'string' && o.videoTeaserEndSlideText.trim()
          ? o.videoTeaserEndSlideText.trim()
          : d.videoTeaserEndSlideText,
      videoTeaserEndSlideEnabled: o.videoTeaserEndSlideEnabled !== false,
      publishVideosAsReels: o.publishVideosAsReels !== false,
      publishImagesAsPhotoPost: o.publishImagesAsPhotoPost !== false,
      fallbackToLinkOnMediaFailure: o.fallbackToLinkOnMediaFailure !== false,
      socialVideoUsePortalTeaserRule: o.socialVideoUsePortalTeaserRule !== false,
      socialVideoTeaserSeconds:
        o.socialVideoTeaserSeconds === null || o.socialVideoTeaserSeconds === undefined
          ? d.socialVideoTeaserSeconds
          : this.num(o.socialVideoTeaserSeconds, d.videoTeaserMaxSeconds, 1, 120),
      socialVideoPublishFull: o.socialVideoPublishFull === true,
    };
  }

  normalize(raw: unknown): SocialAutopostSettings {
    const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const d = DEFAULT_SOCIAL_AUTOPOST_SETTINGS;
    const fbRaw =
      o.facebook && typeof o.facebook === 'object'
        ? (o.facebook as Record<string, unknown>)
        : {};

    const facebook: FacebookAutopostSettings = {
      enabled: fbRaw.enabled === true,
      pageId: this.str(fbRaw.pageId),
      pageAccessTokenEncrypted: this.str(fbRaw.pageAccessTokenEncrypted),
      pageName: this.str(fbRaw.pageName),
      userAccessTokenEncrypted: this.str(fbRaw.userAccessTokenEncrypted),
      tokenExpiresAt:
        fbRaw.tokenExpiresAt === null || typeof fbRaw.tokenExpiresAt === 'string'
          ? (fbRaw.tokenExpiresAt as string | null)
          : null,
      tokenObtainedAt:
        fbRaw.tokenObtainedAt === null || typeof fbRaw.tokenObtainedAt === 'string'
          ? (fbRaw.tokenObtainedAt as string | null)
          : null,
      tokenLastUsedAt:
        fbRaw.tokenLastUsedAt === null || typeof fbRaw.tokenLastUsedAt === 'string'
          ? (fbRaw.tokenLastUsedAt as string | null)
          : null,
      tokenScopes: Array.isArray(fbRaw.tokenScopes)
        ? fbRaw.tokenScopes.filter((x): x is string => typeof x === 'string')
        : [],
      tokenWarning:
        fbRaw.tokenWarning === null || typeof fbRaw.tokenWarning === 'string'
          ? (fbRaw.tokenWarning as string | null)
          : null,
      connectedViaOAuth: fbRaw.connectedViaOAuth === true,
      publishPosts: fbRaw.publishPosts !== false,
      publishProperties: fbRaw.publishProperties !== false,
      publishShorts: fbRaw.publishShorts !== false,
      publishShortsAsReels: fbRaw.publishShortsAsReels !== false,
      publishPostVideosAsReels: fbRaw.publishPostVideosAsReels !== false,
      reelsFallbackToVideoPost: fbRaw.reelsFallbackToVideoPost !== false,
      reelsFallbackToPhotoPost: fbRaw.reelsFallbackToPhotoPost !== false,
      approvedOnly: fbRaw.approvedOnly !== false,
      publicPostsOnly: fbRaw.publicPostsOnly !== false,
      professionalsOnly: fbRaw.professionalsOnly === true,
      allowedRoles: this.roles(fbRaw.allowedRoles),
      repeatPublishing: fbRaw.repeatPublishing !== false,
    };

    const logsRaw = Array.isArray(o.lastApiResponses) ? o.lastApiResponses : [];
    const lastApiResponses: SocialApiLogEntry[] = logsRaw
      .filter((x) => x && typeof x === 'object')
      .slice(0, MAX_API_LOGS) as SocialApiLogEntry[];

    return {
      global: this.globalSettings(o.global),
      facebook,
      instagram: this.instagramSettings(o.instagram),
      youtube: this.platformSettings(o.youtube, DEFAULT_PLATFORM_PLACEHOLDER),
      tiktok: this.platformSettings(o.tiktok, DEFAULT_PLATFORM_PLACEHOLDER),
      lastApiResponses,
    };
  }

  async reload() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
    this.stored = this.normalize(row?.valueJson ?? DEFAULT_SOCIAL_AUTOPOST_SETTINGS);
    this.applyEnvFallback();
  }

  getSettings(): SocialAutopostSettings {
    return structuredClone(this.stored);
  }

  private applyEnvFallback() {
    const envPageId = this.config.get<string>('FACEBOOK_PAGE_ID')?.trim();
    const envToken = this.config.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN')?.trim();
    if (!this.stored.facebook.pageId && envPageId) {
      this.stored.facebook.pageId = envPageId;
    }
    if (!this.stored.facebook.pageAccessTokenEncrypted && envToken) {
      try {
        this.stored.facebook.pageAccessTokenEncrypted = this.tokenEncryption.encrypt(envToken);
      } catch (err) {
        this.logger.warn(`Env FACEBOOK_PAGE_ACCESS_TOKEN encrypt failed: ${String(err)}`);
      }
    }
    if (!this.stored.facebook.pageName && envPageId) {
      this.stored.facebook.pageName = 'XXREALIT (env)';
    }
  }

  resolveFacebookPageAccessToken(): string | null {
    const enc = this.stored.facebook.pageAccessTokenEncrypted?.trim();
    if (enc) {
      try {
        return this.tokenEncryption.decrypt(enc);
      } catch (err) {
        this.logger.warn(`Facebook page token decrypt failed: ${String(err)}`);
      }
    }
    const envToken = this.config.get<string>('FACEBOOK_PAGE_ACCESS_TOKEN')?.trim();
    return envToken || null;
  }

  resolveFacebookUserAccessToken(): string | null {
    const enc = this.stored.facebook.userAccessTokenEncrypted?.trim();
    if (!enc) return null;
    try {
      return this.tokenEncryption.decrypt(enc);
    } catch (err) {
      this.logger.warn(`Facebook user token decrypt failed: ${String(err)}`);
      return null;
    }
  }

  async touchTokenLastUsed() {
    const now = new Date().toISOString();
    await this.updateSettings({
      facebook: { tokenLastUsedAt: now },
    });
  }

  async setTokenWarning(message: string | null) {
    await this.updateSettings({
      facebook: { tokenWarning: message },
    });
  }

  resolveFacebookPageId(): string | null {
    return (
      this.stored.facebook.pageId?.trim() ||
      this.config.get<string>('FACEBOOK_PAGE_ID')?.trim() ||
      null
    );
  }

  isFacebookAutopostReady(): boolean {
    return Boolean(
      this.stored.facebook.enabled &&
        this.resolveFacebookPageId() &&
        this.resolveFacebookPageAccessToken(),
    );
  }

  /** Připojení k FB stránce (token + pageId) — bez ohledu na přepínač autopost. */
  isFacebookPublishingConfigured(): boolean {
    return Boolean(this.resolveFacebookPageId() && this.resolveFacebookPageAccessToken());
  }

  isInstagramPublishingConfigured(): boolean {
    const ig = this.stored.instagram;
    return Boolean(
      this.resolveFacebookPageAccessToken() &&
        this.resolveFacebookPageId() &&
        ig.instagramBusinessId?.trim(),
    );
  }

  isInstagramAutopostReady(): boolean {
    return Boolean(this.stored.instagram.enabled && this.isInstagramPublishingConfigured());
  }

  toPublic(settings: SocialAutopostSettings = this.stored): SocialAutopostSettingsPublic {
    const token = this.resolveFacebookPageAccessToken();
    const {
      pageAccessTokenEncrypted: _enc,
      userAccessTokenEncrypted: _userEnc,
      ...fbRest
    } = settings.facebook;
    return {
      global: settings.global,
      facebook: {
        ...fbRest,
        facebookEnabled: settings.facebook.enabled,
        connected: Boolean(settings.facebook.pageId && token),
        maskedToken: maskAccessToken(token),
        tokenSet: Boolean(token),
      },
      instagram: settings.instagram,
      youtube: settings.youtube,
      tiktok: settings.tiktok,
      lastApiResponses: settings.lastApiResponses.slice(0, MAX_API_LOGS),
    };
  }

  async getPublicSettings(): Promise<SocialAutopostSettingsPublic> {
    await this.reload();
    return this.toPublic();
  }

  async updateSettings(
    patch: {
      global?: Partial<SocialAutopostGlobalSettings>;
      facebook?: Partial<FacebookAutopostSettings> & {
        pageAccessToken?: string;
        userAccessToken?: string;
      };
      instagram?: Partial<InstagramAutopostSettings>;
      youtube?: Partial<typeof DEFAULT_PLATFORM_PLACEHOLDER>;
      tiktok?: Partial<typeof DEFAULT_PLATFORM_PLACEHOLDER>;
      lastApiResponses?: SocialAutopostSettings['lastApiResponses'];
    },
  ) {
    const current = this.getSettings();
    const fbPatch = (patch.facebook ?? {}) as Partial<FacebookAutopostSettings> & {
      pageAccessToken?: string;
      userAccessToken?: string;
    };

    let pageAccessTokenEncrypted = current.facebook.pageAccessTokenEncrypted;
    if (typeof fbPatch.pageAccessToken === 'string' && fbPatch.pageAccessToken.trim()) {
      pageAccessTokenEncrypted = this.tokenEncryption.encrypt(fbPatch.pageAccessToken.trim());
    }

    let userAccessTokenEncrypted = current.facebook.userAccessTokenEncrypted;
    if (typeof fbPatch.userAccessToken === 'string' && fbPatch.userAccessToken.trim()) {
      userAccessTokenEncrypted = this.tokenEncryption.encrypt(fbPatch.userAccessToken.trim());
    }

    const next: SocialAutopostSettings = {
      ...current,
      global: { ...current.global, ...(patch.global ?? {}) },
      facebook: {
        ...current.facebook,
        ...fbPatch,
        pageAccessTokenEncrypted,
        userAccessTokenEncrypted,
        allowedRoles: fbPatch.allowedRoles ?? current.facebook.allowedRoles,
        tokenScopes: fbPatch.tokenScopes ?? current.facebook.tokenScopes,
      },
      instagram: { ...current.instagram, ...(patch.instagram ?? {}) },
      youtube: { ...current.youtube, ...(patch.youtube ?? {}) },
      tiktok: { ...current.tiktok, ...(patch.tiktok ?? {}) },
      lastApiResponses: patch.lastApiResponses ?? current.lastApiResponses,
    };

    delete (next.facebook as Record<string, unknown>).pageAccessToken;
    delete (next.facebook as Record<string, unknown>).userAccessToken;

    await this.prisma.appSetting.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, valueJson: next as object },
      update: { valueJson: next as object },
    });

    this.stored = next;
    this.applyEnvFallback();
    return this.toPublic();
  }

  async appendApiLog(entry: Omit<SocialApiLogEntry, 'at'>) {
    const current = this.getSettings();
    const nextLog: SocialApiLogEntry = { at: new Date().toISOString(), ...entry };
    const lastApiResponses = [nextLog, ...current.lastApiResponses].slice(0, MAX_API_LOGS);
    await this.updateSettings({ lastApiResponses });
  }
}
