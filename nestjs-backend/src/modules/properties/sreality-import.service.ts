import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ImportSourceAvailabilityStatus,
  ListingImportPortal,
  Prisma,
} from '@prisma/client';
import axios from 'axios';
import { PrismaService } from '../../database/prisma.service';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import { ListingsPrefillService } from './listings-prefill.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { ListingWatermarkSettingsService } from './listing-watermark-settings.service';
import { SrealityListingTextRewriteService } from './sreality-listing-text-rewrite.service';
import {
  extractListingIdFromUrl,
  type SrealityListingPrefill,
} from './sreality-listing-prefill.util';
import {
  extractSrealityBrokerFromRaw,
  formatImportedContactName,
  hasSrealityBrokerData,
  type SrealityBrokerPrefill,
} from './sreality-broker-extract.util';
import { isSrealityHost } from '../link-preview/sreality-scraper.util';
import { computeStoredOgMediaFields } from './property-og-media.util';
import { SeoLocationService } from '../seo/seo-location.service';
import type {
  SrealityBrokerMatchStatus,
  SrealityImportImageRow,
  SrealityImportPreview,
  SrealityImportPublishPayload,
  SrealityImportUpdateDiff,
  SrealityImageImportStats,
} from './sreality-import.types';
import type { SrealityPrefillResult } from './listings-prefill.service';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 12 * 1024;
const MAX_IMAGES = 30;

@Injectable()
export class SrealityImportService {
  private readonly log = new Logger(SrealityImportService.name);

  constructor(
    private readonly prefill: ListingsPrefillService,
    private readonly prisma: PrismaService,
    private readonly textRewrite: SrealityListingTextRewriteService,
    private readonly brokerContacts: ImportedBrokerContactService,
    private readonly propertyMediaCloudinary: PropertyMediaCloudinaryService,
    private readonly watermarkSettings: ListingWatermarkSettingsService,
    private readonly seoLocation: SeoLocationService,
  ) {}

  /** Sdílený entrypoint pro veřejný formulář i administraci. */
  async prefillFromUrl(
    sourceUrl: string,
    options?: { debug?: boolean },
  ): Promise<SrealityPrefillResult> {
    const result = await this.prefill.prefillFromUrl(sourceUrl, options);
    if (!result.ok) return result;

    const listingId = extractListingIdFromUrl(sourceUrl);
    const broker = extractSrealityBrokerFromRaw(result.data.rawSourceData);
    const enriched: SrealityListingPrefill = {
      ...result.data,
      sourceExternalId: listingId,
      brokerAgentName: broker.agentName,
      brokerCompanyName: broker.companyName,
      brokerPhone: broker.phone,
      brokerEmail: broker.email,
      brokerPhotoUrl: broker.photoUrl,
      brokerLogoUrl: broker.logoUrl,
      brokerProfileUrl: broker.profileUrl,
      brokerSourceExternalId: broker.sourceExternalId,
    };
    return { ...result, data: enriched };
  }

  async fetchSourceImages(urls: string[]) {
    return this.prefill.fetchSourceImages(urls);
  }

  async findDuplicateByUrl(sourceUrl: string) {
    const normalized = sourceUrl.trim();
    const listingId = extractListingIdFromUrl(normalized);
    if (listingId) {
      const byExternal = await this.prisma.property.findFirst({
        where: {
          importSource: ListingImportPortal.sreality,
          importExternalId: listingId,
          deletedAt: null,
        },
        select: { id: true, importedAt: true, title: true },
      });
      if (byExternal) return byExternal;
    }
    return this.prisma.property.findFirst({
      where: { importSourceUrl: normalized, deletedAt: null },
      select: { id: true, importedAt: true, title: true },
    });
  }

  async createImportPreview(adminUserId: string, sourceUrl: string): Promise<SrealityImportPreview> {
    const duplicate = await this.findDuplicateByUrl(sourceUrl);
    const prefillResult = await this.prefillFromUrl(sourceUrl, { debug: true });
    if (!prefillResult.ok) {
      throw new BadRequestException(prefillResult.error);
    }

    const prefill = prefillResult.data;
    const listingId = extractListingIdFromUrl(sourceUrl);
    const broker = this.brokerFromPrefill(prefill);
    const { matchStatus, matchedId, matchedContact } = await this.matchBroker(broker);

    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { images, stats } = await this.mirrorImages(
      prefill.sourceImageUrls,
      `sreality-draft-${draftId}`,
    );
    const aiText = await this.textRewrite.rewriteListingText(prefill);

    const draft = await this.prisma.srealityImportDraft.create({
      data: {
        id: draftId,
        adminUserId,
        sourceUrl: sourceUrl.trim(),
        sourceExternalId: listingId,
        status: 'preview',
        prefillJson: prefill as unknown as Prisma.InputJsonValue,
        brokerJson: broker as unknown as Prisma.InputJsonValue,
        imagesJson: images as unknown as Prisma.InputJsonValue,
        imageImportStats: stats as unknown as Prisma.InputJsonValue,
        aiTextJson: aiText as unknown as Prisma.InputJsonValue,
        brokerMatchStatus: matchStatus,
        matchedBrokerContactId: matchedId,
      },
    });

    return {
      draftId: draft.id,
      duplicate: {
        isDuplicate: Boolean(duplicate),
        propertyId: duplicate?.id,
        importedAt: duplicate?.importedAt?.toISOString(),
      },
      prefill,
      broker,
      brokerMatchStatus: matchStatus,
      matchedBrokerContactId: matchedId,
      matchedBrokerContact: matchedContact,
      images,
      imageImportStats: stats,
      aiText,
      sourceExternalId: listingId,
      sourceUrl: sourceUrl.trim(),
    };
  }

  async getDraft(draftId: string) {
    const draft = await this.prisma.srealityImportDraft.findUnique({ where: { id: draftId } });
    if (!draft) throw new NotFoundException('Import koncept nenalezen.');
    return draft;
  }

  async updateDraft(
    draftId: string,
    patch: Partial<SrealityImportPublishPayload>,
  ) {
    const draft = await this.getDraft(draftId);
    if (draft.status !== 'preview') {
      throw new BadRequestException('Koncept již není ve stavu náhledu.');
    }

    const prefill = draft.prefillJson as unknown as SrealityListingPrefill;
    const aiText = (draft.aiTextJson ?? {}) as Record<string, unknown>;

    if (patch.title) prefill.title = patch.title;
    if (patch.description) prefill.description = patch.description;
    if (patch.offerType) prefill.offerType = patch.offerType;
    if (patch.propertyType) prefill.propertyType = patch.propertyType;
    if (patch.subType !== undefined) prefill.subType = patch.subType;
    if (patch.price !== undefined) prefill.price = patch.price;
    if (patch.currency) prefill.currency = patch.currency;
    if (patch.city) prefill.city = patch.city;
    if (patch.district !== undefined) prefill.district = patch.district;
    if (patch.region !== undefined) prefill.region = patch.region;
    if (patch.address !== undefined) prefill.address = patch.address;
    if (patch.area !== undefined) prefill.area = patch.area;
    if (patch.landArea !== undefined) prefill.landArea = patch.landArea;
    if (patch.floor !== undefined) prefill.floor = patch.floor;
    if (patch.totalFloors !== undefined) prefill.totalFloors = patch.totalFloors;
    if (patch.condition !== undefined) prefill.condition = patch.condition;
    if (patch.construction !== undefined) prefill.construction = patch.construction;
    if (patch.ownership !== undefined) prefill.ownership = patch.ownership;
    if (patch.equipment !== undefined) prefill.equipment = patch.equipment;

    if (patch.title || patch.description) {
      aiText.rewrittenTitle = patch.title ?? aiText.rewrittenTitle;
      aiText.rewrittenDescription = patch.description ?? aiText.rewrittenDescription;
    }

    const broker = (draft.brokerJson ?? {}) as SrealityBrokerPrefill;
    if (patch.contactName) broker.agentName = patch.contactName.split(' · ')[0]?.trim() ?? patch.contactName;
    if (patch.contactPhone !== undefined) broker.phone = patch.contactPhone || null;
    if (patch.contactEmail !== undefined) broker.email = patch.contactEmail || null;

    const images = (patch.images ?? draft.imagesJson) as unknown as SrealityImportImageRow[];

    return this.prisma.srealityImportDraft.update({
      where: { id: draftId },
      data: {
        prefillJson: prefill as unknown as Prisma.InputJsonValue,
        brokerJson: broker as unknown as Prisma.InputJsonValue,
        aiTextJson: aiText as unknown as Prisma.InputJsonValue,
        imagesJson: images as unknown as Prisma.InputJsonValue,
        settingsJson: patch.settings
          ? (patch.settings as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async publishDraft(
    adminUserId: string,
    draftId: string,
    payload: SrealityImportPublishPayload,
  ): Promise<{ propertyId: string; createAiReel: boolean }> {
    const draft = await this.getDraft(draftId);
    if (draft.status === 'published' && draft.propertyId) {
      return {
        propertyId: draft.propertyId,
        createAiReel: payload.settings?.createAiReel === true,
      };
    }

    const duplicate = await this.findDuplicateByUrl(draft.sourceUrl);
    if (duplicate && !draft.propertyId) {
      throw new ConflictException({
        message: 'Tento inzerát už byl importován.',
        propertyId: duplicate.id,
      });
    }

    const wmSettings = await this.watermarkSettings.getSettings();
    const images = payload.images.filter((i) => i.storedUrl?.trim());
    const displayImages = images.map((img) =>
      wmSettings.enabled && img.watermarkedUrl ? img.watermarkedUrl! : img.storedUrl,
    );
    const mainIdx = images.findIndex((i) => i.isMain);
    const sorted = [...images].sort((a, b) => a.sortOrder - b.sortOrder);
    if (mainIdx > 0) {
      const [main] = sorted.splice(mainIdx, 1);
      sorted.unshift(main!);
    }
    const orderedDisplay = sorted.map((img) =>
      wmSettings.enabled && img.watermarkedUrl ? img.watermarkedUrl! : img.storedUrl,
    );

    const ogMedia = computeStoredOgMediaFields({ images: orderedDisplay, videoUrl: null });
    const aiText = (draft.aiTextJson ?? {}) as Record<string, string | null>;
    const originalDescription =
      (aiText.originalDescription as string | null) ?? payload.description;

    const contactName = payload.contactName.trim() || formatImportedContactName(this.brokerFromJson(draft.brokerJson));
    const locLink = await this.seoLocation.resolveForPropertyAddress({
      city: payload.city,
      district: payload.district,
      region: payload.region,
      address: payload.address,
    });

    const listingId = draft.sourceExternalId ?? extractListingIdFromUrl(draft.sourceUrl);
    const now = new Date();

    const property = await this.prisma.property.create({
      data: {
        userId: adminUserId,
        title: payload.title.trim(),
        description: payload.description.trim(),
        price: payload.price != null && payload.price > 0 ? Math.trunc(payload.price) : null,
        currency: (payload.currency ?? 'CZK').trim().slice(0, 8) || 'CZK',
        offerType: payload.offerType.trim() || 'prodej',
        propertyType: payload.propertyType.trim() || 'byt',
        subType: (payload.subType ?? '').trim().slice(0, 120),
        address: (payload.address ?? '').trim().slice(0, 500),
        city: payload.city.trim(),
        seoLocationId: locLink.seoLocationId,
        region: (payload.region ?? '').trim().slice(0, 120),
        district: (payload.district ?? '').trim().slice(0, 120),
        area: payload.area ?? null,
        landArea: payload.landArea ?? null,
        floor: payload.floor ?? null,
        totalFloors: payload.totalFloors ?? null,
        condition: payload.condition?.trim() || null,
        construction: payload.construction?.trim() || null,
        ownership: payload.ownership?.trim() || null,
        energyLabel: payload.energyLabel?.trim() || null,
        equipment: payload.equipment?.trim() || null,
        parking: payload.parking ?? false,
        cellar: payload.cellar ?? false,
        images: orderedDisplay.length ? orderedDisplay : displayImages,
        mainImage: ogMedia.mainImage,
        thumbnailUrl: ogMedia.thumbnailUrl,
        generatedVideoThumbnail: ogMedia.generatedVideoThumbnail,
        videoUrl: null,
        contactName: contactName.slice(0, 200) || 'Sreality import',
        contactPhone: payload.contactPhone.trim().slice(0, 40),
        contactEmail: payload.contactEmail.trim().toLowerCase().slice(0, 120),
        approved: true,
        status: 'APPROVED',
        isActive: true,
        isVisible: true,
        listingType: 'CLASSIC',
        importSource: ListingImportPortal.sreality,
        importExternalId: listingId,
        importSourceUrl: draft.sourceUrl,
        importedAt: now,
        importOriginalDescription: originalDescription?.slice(0, 50_000) ?? null,
        importSourceStatus: ImportSourceAvailabilityStatus.AVAILABLE,
        sourcePortalKey: 'sreality',
        sourcePortalLabel: 'Sreality.cz',
        lastSyncedAt: now,
      },
    });

    const mediaRows = sorted.map((img, i) => ({
      propertyId: property.id,
      url: wmSettings.enabled && img.watermarkedUrl ? img.watermarkedUrl : img.storedUrl,
      originalUrl: img.storedUrl,
      watermarkedUrl: img.watermarkedUrl ?? null,
      type: 'image' as const,
      sortOrder: i,
    }));

    if (mediaRows.length) {
      await this.prisma.propertyMedia.createMany({ data: mediaRows });
    }

    await this.brokerContacts.syncFromImportedProperty(property.id);

    await this.prisma.srealityImportDraft.update({
      where: { id: draftId },
      data: {
        status: 'published',
        propertyId: property.id,
        publishedAt: now,
        settingsJson: payload.settings
          ? (payload.settings as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    });

    return {
      propertyId: property.id,
      createAiReel: payload.settings?.createAiReel === true,
    };
  }

  async compareRefresh(propertyId: string, sourceUrl: string): Promise<SrealityImportUpdateDiff> {
    const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
    if (!property) throw new NotFoundException('Inzerát nenalezen.');

    const prefillResult = await this.prefillFromUrl(sourceUrl);
    if (!prefillResult.ok) {
      throw new BadRequestException(prefillResult.error);
    }
    const incoming = prefillResult.data;
    const incomingBroker = this.brokerFromPrefill(incoming);
    const currentBroker: SrealityBrokerPrefill = {
      agentName: property.contactName.split(' · ')[0]?.trim() || property.contactName,
      companyName: property.contactName.includes(' · ')
        ? property.contactName.split(' · ').slice(1).join(' · ').trim()
        : null,
      phone: property.contactPhone || null,
      email: property.contactEmail || null,
      photoUrl: null,
      logoUrl: null,
      profileUrl: null,
      sourceExternalId: null,
    };

    const brokerChanged = Boolean(
      (incomingBroker.email && incomingBroker.email !== currentBroker.email) ||
        (incomingBroker.phone && incomingBroker.phone !== currentBroker.phone) ||
        (incomingBroker.agentName &&
          incomingBroker.agentName !== currentBroker.agentName &&
          !property.contactName.includes(incomingBroker.agentName)),
    );

    return {
      priceChanged: incoming.price != null && incoming.price !== property.price,
      descriptionChanged:
        Boolean(incoming.description?.trim()) &&
        incoming.description!.trim() !== property.description.trim(),
      parametersChanged:
        (incoming.area != null && incoming.area !== property.area) ||
        (incoming.floor != null && incoming.floor !== property.floor),
      imagesChanged: incoming.sourceImageUrls.length !== property.images.length,
      brokerChanged,
      oldPrice: property.price,
      newPrice: incoming.price,
      brokerChange: brokerChanged
        ? { current: currentBroker, incoming: incomingBroker }
        : undefined,
    };
  }

  async markSourceUnavailable(propertyId: string) {
    return this.prisma.property.update({
      where: { id: propertyId },
      data: { importSourceStatus: ImportSourceAvailabilityStatus.SOURCE_UNAVAILABLE },
    });
  }

  private brokerFromPrefill(prefill: SrealityListingPrefill): SrealityBrokerPrefill {
    const fromRaw = extractSrealityBrokerFromRaw(prefill.rawSourceData);
    return {
      agentName: prefill.brokerAgentName ?? fromRaw.agentName,
      companyName: prefill.brokerCompanyName ?? fromRaw.companyName,
      phone: prefill.brokerPhone ?? fromRaw.phone,
      email: prefill.brokerEmail ?? fromRaw.email,
      photoUrl: prefill.brokerPhotoUrl ?? fromRaw.photoUrl,
      logoUrl: prefill.brokerLogoUrl ?? fromRaw.logoUrl,
      profileUrl: prefill.brokerProfileUrl ?? fromRaw.profileUrl,
      sourceExternalId: prefill.brokerSourceExternalId ?? fromRaw.sourceExternalId,
    };
  }

  private brokerFromJson(json: unknown): SrealityBrokerPrefill {
    if (!json || typeof json !== 'object') {
      return extractSrealityBrokerFromRaw(null);
    }
    return json as SrealityBrokerPrefill;
  }

  private async matchBroker(broker: SrealityBrokerPrefill): Promise<{
    matchStatus: SrealityBrokerMatchStatus;
    matchedId: string | null;
    matchedContact: SrealityImportPreview['matchedBrokerContact'];
  }> {
    if (!hasSrealityBrokerData(broker)) {
      return { matchStatus: 'NOT_FOUND', matchedId: null, matchedContact: null };
    }

    const email = broker.email?.trim().toLowerCase();
    if (email) {
      const byEmail = await this.prisma.importedBrokerContact.findFirst({
        where: { email },
      });
      if (byEmail) {
        return {
          matchStatus: 'EXISTING_PROFILE',
          matchedId: byEmail.id,
          matchedContact: {
            id: byEmail.id,
            fullName: byEmail.fullName,
            companyName: byEmail.companyName,
            email: byEmail.email,
            phone: byEmail.phone,
          },
        };
      }
    }

    const phone = broker.phone?.trim();
    if (phone) {
      const byPhone = await this.prisma.importedBrokerContact.findFirst({
        where: { phone },
      });
      if (byPhone) {
        return {
          matchStatus: 'EXISTING_PROFILE',
          matchedId: byPhone.id,
          matchedContact: {
            id: byPhone.id,
            fullName: byPhone.fullName,
            companyName: byPhone.companyName,
            email: byPhone.email,
            phone: byPhone.phone,
          },
        };
      }
    }

    const name = broker.agentName?.trim();
    const company = broker.companyName?.trim();
    if (name && company) {
      const byName = await this.prisma.importedBrokerContact.findFirst({
        where: {
          fullName: { equals: name, mode: 'insensitive' },
          companyName: { equals: company, mode: 'insensitive' },
        },
      });
      if (byName) {
        return {
          matchStatus: 'EXISTING_PROFILE',
          matchedId: byName.id,
          matchedContact: {
            id: byName.id,
            fullName: byName.fullName,
            companyName: byName.companyName,
            email: byName.email,
            phone: byName.phone,
          },
        };
      }
    }

    if (hasSrealityBrokerData(broker)) {
      return { matchStatus: 'NEW_IMPORTED_CONTACT', matchedId: null, matchedContact: null };
    }

    return { matchStatus: 'NOT_FOUND', matchedId: null, matchedContact: null };
  }

  private async mirrorImages(
    urls: string[],
    storageKey: string,
  ): Promise<{ images: SrealityImportImageRow[]; stats: SrealityImageImportStats }> {
    const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(0, MAX_IMAGES);
    const images: SrealityImportImageRow[] = [];
    let downloaded = 0;

    for (let i = 0; i < unique.length; i += 1) {
      const sourceUrl = unique[i]!;
      if (!isSrealityHost(sourceUrl)) {
        images.push({
          sourceUrl,
          storedUrl: null,
          watermarkedUrl: null,
          sortOrder: i,
          isMain: i === 0,
          error: 'Neplatný hostitel',
        });
        continue;
      }

      try {
        const res = await axios.get(sourceUrl, {
          responseType: 'arraybuffer',
          timeout: 15_000,
          maxRedirects: 5,
          maxContentLength: MAX_IMAGE_BYTES,
          validateStatus: (s: number) => s >= 200 && s < 300,
          headers: { Accept: 'image/*', 'User-Agent': BROWSER_USER_AGENT },
        });
        const ct = String(res.headers['content-type'] ?? '').toLowerCase();
        if (!ct.startsWith('image/')) {
          images.push({
            sourceUrl,
            storedUrl: null,
            watermarkedUrl: null,
            sortOrder: i,
            isMain: i === 0,
            error: 'Neplatný content-type',
          });
          continue;
        }
        const buf = Buffer.from(res.data);
        if (buf.length < MIN_IMAGE_BYTES || buf.length > MAX_IMAGE_BYTES) {
          images.push({
            sourceUrl,
            storedUrl: null,
            watermarkedUrl: null,
            sortOrder: i,
            isMain: i === 0,
            error: 'Neplatná velikost',
          });
          continue;
        }

        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
        const uploaded = await this.propertyMediaCloudinary.uploadImageBufferWithWatermarkVariants(
          buf,
          `${storageKey}-${i + 1}.${ext}`,
        );
        downloaded += 1;
        images.push({
          sourceUrl,
          storedUrl: uploaded.originalUrl,
          watermarkedUrl: uploaded.watermarkedUrl ?? null,
          sortOrder: i,
          isMain: downloaded === 1,
        });
      } catch (err) {
        this.log.warn(
          `mirror image failed ${sourceUrl}: ${err instanceof Error ? err.message : err}`,
        );
        images.push({
          sourceUrl,
          storedUrl: null,
          watermarkedUrl: null,
          sortOrder: i,
          isMain: false,
          error: 'Stažení selhalo',
        });
      }
    }

    if (images.length && !images.some((x) => x.isMain)) {
      const firstOk = images.find((x) => x.storedUrl);
      if (firstOk) firstOk.isMain = true;
    }

    const stats: SrealityImageImportStats = {
      requested: unique.length,
      downloaded,
      failed: unique.length - downloaded,
      message: `Staženo ${downloaded}/${unique.length} fotografií.`,
    };

    return { images, stats };
  }
}
