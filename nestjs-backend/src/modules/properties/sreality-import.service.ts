import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import {
  ImportSourceAvailabilityStatus,
  ListingImportPortal,
  Prisma,
} from '@prisma/client';
import axios from 'axios';
import sharp from 'sharp';
import { PrismaService } from '../../database/prisma.service';
import { ImportImageService } from '../imports/import-image.service';
import { ImportedBrokerContactService } from '../imported-broker-contacts/imported-broker-contact.service';
import { ListingsPrefillService } from './listings-prefill.service';
import { PropertyMediaCloudinaryService } from './property-media-cloudinary.service';
import { ListingWatermarkSettingsService } from './listing-watermark-settings.service';
import { SrealityListingTextRewriteService } from './sreality-listing-text-rewrite.service';
import { SrealityPlaywrightService } from './sreality-playwright.service';
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
import {
  isAllowedSrealityImageRedirectUrl,
  isAllowedSrealityImageUrl,
  SREALITY_IMPORT_MAX_IMAGES,
  validateSrealityMediaUrl,
} from './sreality-import-security.util';
import {
  buildSrealityImageFetchCandidates,
  dedupeSrealityImageUrls,
  sanitizeUrlForDiagnostics,
  srealityImageFetchHeaders,
} from './sreality-image.util';
import {
  extFromContentType,
  findBestCapturedForTargetUrl,
  isBrowserRequiredImageUrl,
  matchKeysForImageUrl,
  shouldSuggestBrowserMediaFallback,
  type SrealityImageCaptureMethod,
} from './sreality-browser-media.util';
import { mergeBrokerParts, extractSrealityBrokerFromHtml } from './sreality-contact-extract.util';
import { computeStoredOgMediaFields } from './property-og-media.util';
import { SeoLocationService } from '../seo/seo-location.service';
import type {
  SrealityBrokerMatchStatus,
  SrealityImageDownloadFailureDiag,
  SrealityImportDiagnostics,
  SrealityImportImageRow,
  SrealityImportPreview,
  SrealityImportPublishPayload,
  SrealityImportUpdateDiff,
  SrealityImageImportStats,
} from './sreality-import.types';
import type { SrealityPrefillResult } from './listings-prefill.service';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_IMAGE_BYTES = 12 * 1024;

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
    private readonly playwright: SrealityPlaywrightService,
    @Inject(forwardRef(() => ImportImageService))
    private readonly importImages: ImportImageService,
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
    this.log.log(`SREALITY_IMPORT_START url=${sourceUrl.trim()}`);
    const duplicate = await this.findDuplicateByUrl(sourceUrl);
    const prefillResult = await this.prefillFromUrl(sourceUrl, { debug: true });
    if (!prefillResult.ok) {
      throw new BadRequestException(prefillResult.error);
    }

    this.log.log('SREALITY_STATIC_PARSE_OK');
    const prefill = prefillResult.data;
    const listingId = extractListingIdFromUrl(sourceUrl);
    let broker = this.brokerFromPrefill(prefill);
    let imageUrls = dedupeSrealityImageUrls(prefill.sourceImageUrls ?? []);

    const diagnostics: SrealityImportDiagnostics = {
      sourceParser: prefillResult.log.strategyUsed !== 'none' ? 'PASS' : 'FAIL',
      dynamicPage: 'NOT_REQUIRED',
      gallery: imageUrls.length > 0 ? 'PASS' : 'FAIL',
      galleryCount: imageUrls.length,
      imagesSelectedCount: 0,
      imagesDownloaded: 'FAIL',
      imagesDownloadedCount: 0,
      imagesFailedCount: 0,
      agent: hasSrealityBrokerData(broker) ? 'PASS' : 'FAIL',
      phone: broker.phone ? 'PASS' : 'NOT_PUBLIC',
      email: broker.email ? 'PASS' : 'NOT_PUBLIC',
      contactClick: 'NOT_REQUIRED',
      storage: 'NOT_REACHED',
      storageCount: 0,
      browserFallback: 'NOT_REQUIRED',
      browser: 'NOT_TESTED',
      pageData: 'STATIC_OK',
      imageAcquisition: 'DIRECT_HTTP',
    };

    const needsContactEnrichment =
      !broker.agentName || (!broker.phone && !broker.email);
    const needsGalleryDiscovery = imageUrls.length === 0;

    const browserHealth = await this.playwright.runBrowserHealthCheck();
    diagnostics.browser = browserHealth.status;
    if (browserHealth.reason) diagnostics.browserError = browserHealth.reason;

    if (needsGalleryDiscovery) {
      diagnostics.dynamicPage = 'NOT_REQUIRED';
      const enrichment = await this.playwright.enrichImportData(sourceUrl.trim());
      diagnostics.dynamicEnrichment =
        enrichment.enrichmentStatus === 'PASS'
          ? 'PASS'
          : enrichment.enrichmentStatus === 'TIMEOUT'
            ? 'PARTIAL'
            : enrichment.errorCode
              ? 'FAIL'
              : 'PARTIAL';
      diagnostics.browserFallback = enrichment.errorCode ? 'FAIL' : 'PASS';
      if (enrichment.errorDetail) diagnostics.browserError = enrichment.errorDetail.slice(0, 200);
      if (enrichment.imageUrls.length) {
        imageUrls = dedupeSrealityImageUrls([...imageUrls, ...enrichment.imageUrls]);
        diagnostics.gallery = imageUrls.length > 0 ? 'PASS' : 'FAIL';
        diagnostics.galleryCount = imageUrls.length;
      }
      if (enrichment.html) {
        broker = mergeBrokerParts([
          broker,
          extractSrealityBrokerFromHtml(enrichment.html),
          enrichment.broker,
        ]);
      } else if (enrichment.broker) {
        broker = mergeBrokerParts([broker, enrichment.broker]);
      }
      diagnostics.contactClick = enrichment.contactClickAttempted
        ? enrichment.contactClickSucceeded
          ? 'PASS'
          : 'FAIL'
        : 'NOT_REQUIRED';
      if (broker.agentName || broker.companyName) diagnostics.agent = 'PASS';
      if (broker.phone) diagnostics.phone = 'PASS';
      if (broker.email) diagnostics.email = 'PASS';
      else if (broker.agentName && !broker.email) diagnostics.email = 'NOT_PUBLIC';
    } else if (needsContactEnrichment) {
      diagnostics.dynamicPage = 'NOT_REQUIRED';
      diagnostics.dynamicEnrichment = 'NOT_REQUIRED';
      diagnostics.browserFallback = 'NOT_REQUIRED';
    } else {
      diagnostics.dynamicPage = 'NOT_REQUIRED';
      diagnostics.dynamicEnrichment = 'NOT_REQUIRED';
      diagnostics.browserFallback = 'NOT_REQUIRED';
    }

    this.log.log(`SREALITY_IMAGES_FOUND count=${imageUrls.length}`);

    if (imageUrls.some((url) => isBrowserRequiredImageUrl(url))) {
      diagnostics.imageAcquisition = 'BROWSER_REQUIRED';
      diagnostics.browserFallback =
        diagnostics.browser === 'READY'
          ? 'NOT_REACHED'
          : diagnostics.browser === 'FAIL'
            ? 'FAIL'
            : 'NOT_REACHED';
    }

    const draftId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { images, stats, browserCapture } = await this.mirrorImages(
      imageUrls,
      sourceUrl.trim(),
      `sreality-draft-${draftId}`,
      { enrichContact: needsContactEnrichment && !needsGalleryDiscovery },
    );

    if (browserCapture) {
      diagnostics.dynamicEnrichment =
        browserCapture.enrichmentStatus === 'PASS'
          ? 'PASS'
          : browserCapture.enrichmentStatus === 'PARTIAL'
            ? 'PARTIAL'
            : browserCapture.enrichmentStatus === 'TIMEOUT'
              ? 'PARTIAL'
              : browserCapture.enrichmentStatus === 'NOT_REQUIRED'
                ? 'NOT_REQUIRED'
                : 'FAIL';
      diagnostics.browserFallback =
        browserCapture.captured.length > 0 || browserCapture.enrichmentStatus === 'PASS'
          ? 'PASS'
          : browserCapture.enrichmentStatus === 'PARTIAL'
            ? 'PARTIAL'
            : 'FAIL';
      if (browserCapture.imageUrlsFound.length) {
        imageUrls = dedupeSrealityImageUrls([...imageUrls, ...browserCapture.imageUrlsFound]);
        diagnostics.gallery = imageUrls.length > 0 ? 'PASS' : 'FAIL';
        diagnostics.galleryCount = imageUrls.length;
      }
      if (browserCapture.html || browserCapture.broker) {
        broker = mergeBrokerParts([
          broker,
          browserCapture.html ? extractSrealityBrokerFromHtml(browserCapture.html) : {},
          browserCapture.broker,
        ]);
      }
      if (browserCapture.contactClickAttempted) {
        diagnostics.contactClick = browserCapture.contactClickSucceeded ? 'PASS' : 'FAIL';
      }
      if (broker.agentName || broker.companyName) diagnostics.agent = 'PASS';
      if (broker.phone) diagnostics.phone = 'PASS';
      if (broker.email) diagnostics.email = 'PASS';
      else if (broker.agentName && !broker.email) diagnostics.email = 'NOT_PUBLIC';
    }

    diagnostics.imagesDownloadedCount = stats.downloaded;
    diagnostics.imagesFailedCount = stats.failed;
    diagnostics.imagesSelectedCount = stats.requested;
    diagnostics.imagesDownloaded =
      stats.downloaded === stats.requested && stats.requested > 0
        ? 'PASS'
        : stats.downloaded > 0
          ? 'PARTIAL'
          : stats.requested > 0
            ? 'FAIL'
            : 'NOT_REQUIRED';
    diagnostics.storageCount = stats.uploaded ?? stats.downloaded;
    if (stats.downloaded === 0 && stats.requested > 0) {
      diagnostics.storage = (stats.uploadAttempted ?? 0) > 0 ? 'FAIL' : 'NOT_REACHED';
    } else if (stats.downloaded > 0) {
      diagnostics.storage =
        (stats.uploaded ?? stats.downloaded) >= stats.downloaded ? 'PASS' : 'FAIL';
    } else {
      diagnostics.storage = 'NOT_REACHED';
    }
    if (stats.imageDownloadFailures?.length) {
      diagnostics.imageDownloadFailures = stats.imageDownloadFailures;
    }

    this.log.log(
      `SREALITY_IMAGES_DOWNLOADED count=${stats.downloaded} failed=${stats.failed}`,
    );
    if (broker.agentName || broker.companyName) {
      this.log.log('SREALITY_AGENT_FOUND');
    }

    const { matchStatus, matchedId, matchedContact } = await this.matchBroker(broker);
    const aiText = await this.textRewrite.rewriteListingText(prefill);

    const draft = await this.prisma.srealityImportDraft.create({
      data: {
        id: draftId,
        adminUserId,
        sourceUrl: sourceUrl.trim(),
        sourceExternalId: listingId,
        status: 'preview',
        prefillJson: { ...prefill, sourceImageUrls: imageUrls } as unknown as Prisma.InputJsonValue,
        brokerJson: broker as unknown as Prisma.InputJsonValue,
        imagesJson: images as unknown as Prisma.InputJsonValue,
        imageImportStats: stats as unknown as Prisma.InputJsonValue,
        aiTextJson: aiText as unknown as Prisma.InputJsonValue,
        brokerMatchStatus: matchStatus,
        matchedBrokerContactId: matchedId,
        settingsJson: { diagnostics } as unknown as Prisma.InputJsonValue,
      },
    });

    this.log.log('SREALITY_IMPORT_DONE');

    return {
      draftId: draft.id,
      duplicate: {
        isDuplicate: Boolean(duplicate),
        propertyId: duplicate?.id,
        importedAt: duplicate?.importedAt?.toISOString(),
      },
      prefill: { ...prefill, sourceImageUrls: imageUrls },
      broker,
      brokerMatchStatus: matchStatus,
      matchedBrokerContactId: matchedId,
      matchedBrokerContact: matchedContact,
      images,
      imageImportStats: stats,
      aiText,
      sourceExternalId: listingId,
      sourceUrl: sourceUrl.trim(),
      diagnostics,
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

  async runBrowserHealthCheck() {
    return this.playwright.runBrowserHealthCheck();
  }

  private async mirrorImages(
    urls: string[],
    sourceListingUrl: string,
    storageKey: string,
    options?: { enrichContact?: boolean },
  ): Promise<{
    images: SrealityImportImageRow[];
    stats: SrealityImageImportStats;
    browserCapture?: Awaited<ReturnType<SrealityPlaywrightService['captureGalleryImages']>>;
  }> {
    const found = dedupeSrealityImageUrls(urls);
    const unique = found.slice(0, SREALITY_IMPORT_MAX_IMAGES);
    const images: SrealityImportImageRow[] = [];
    const imageDownloadFailures: SrealityImageDownloadFailureDiag[] = [];
    const pushImageDiag = (diag: SrealityImageDownloadFailureDiag) => {
      if (imageDownloadFailures.length < unique.length) imageDownloadFailures.push(diag);
    };
    const pendingBrowser: Array<{ index: number; sourceUrl: string; directHttpStatus: number | null }> =
      [];
    const captureMethods: Partial<Record<SrealityImageCaptureMethod, number>> = {
      DIRECT_HTTP: 0,
      BROWSER_RESPONSE: 0,
      BROWSER_CONTEXT: 0,
      DOM_BLOB: 0,
      ELEMENT_CAPTURE: 0,
    };
    let downloaded = 0;
    let uploadAttempted = 0;
    let uploaded = 0;

    for (let i = 0; i < unique.length; i += 1) {
      const sourceUrl = unique[i]!;
      const mediaValidation = validateSrealityMediaUrl(sourceUrl);
      if (!mediaValidation.allowed) {
        pushImageDiag({
          index: i + 1,
          host: mediaValidation.host ?? '—',
          hostValidation: mediaValidation.hostValidation,
          httpStatus: null,
          contentType: null,
          responseLength: null,
          redirectHost: null,
          error: mediaValidation.reason ?? 'Neplatný hostitel',
          urlSample: sanitizeUrlForDiagnostics(sourceUrl),
          sourceUrl,
          storage: 'FAILED',
        });
        images.push({
          sourceUrl,
          storedUrl: null,
          watermarkedUrl: null,
          sortOrder: i,
          isMain: false,
          error: mediaValidation.reason ?? 'Neplatný hostitel',
        });
        continue;
      }

      let stored: { storedUrl: string; watermarkedUrl: string | null } | null = null;
      let directHttpStatus: number | null = null;

      if (isBrowserRequiredImageUrl(sourceUrl)) {
        pendingBrowser.push({ index: i, sourceUrl, directHttpStatus: 401 });
        pushImageDiag({
          index: i + 1,
          host: (() => {
            try {
              return new URL(sourceUrl).hostname;
            } catch {
              return '—';
            }
          })(),
          hostValidation: 'PASS',
          httpStatus: 401,
          directHttpStatus: 401,
          contentType: 'text/html',
          responseLength: null,
          redirectHost: null,
          error: 'SDN CDN vyžaduje browser session',
          urlSample: sanitizeUrlForDiagnostics(sourceUrl),
          sourceUrl,
          selectedUrl: sourceUrl,
          storage: 'PENDING',
        });
        images.push({
          sourceUrl,
          storedUrl: null,
          watermarkedUrl: null,
          sortOrder: i,
          isMain: false,
          error: 'Čeká na browser capture',
        });
        continue;
      }

      const direct = await this.downloadImageDirect(
        sourceUrl,
        sourceListingUrl,
        storageKey,
        i,
        (diag) => {
          directHttpStatus = diag.httpStatus;
          pushImageDiag(diag);
        },
      );
      if (direct) {
        stored = direct;
        captureMethods.DIRECT_HTTP = (captureMethods.DIRECT_HTTP ?? 0) + 1;
      } else if (shouldSuggestBrowserMediaFallback(directHttpStatus)) {
        pendingBrowser.push({ index: i, sourceUrl, directHttpStatus });
      }

      if (stored?.storedUrl) {
        downloaded += 1;
        uploadAttempted += 1;
        uploaded += 1;
        pushImageDiag({
          index: i + 1,
          host: (() => {
            try {
              return new URL(sourceUrl).hostname;
            } catch {
              return '—';
            }
          })(),
          hostValidation: 'PASS',
          httpStatus: 200,
          contentType: 'image/jpeg',
          responseLength: null,
          redirectHost: null,
          error: '',
          urlSample: sanitizeUrlForDiagnostics(sourceUrl),
          sourceUrl,
          selectedUrl: sourceUrl,
          captureMethod: 'DIRECT_HTTP',
          mime: 'image/jpeg',
          storage: 'UPLOADED',
        });
        images.push({
          sourceUrl,
          storedUrl: stored.storedUrl,
          watermarkedUrl: stored.watermarkedUrl,
          sortOrder: i,
          isMain: downloaded === 1,
        });
      } else if (!shouldSuggestBrowserMediaFallback(directHttpStatus)) {
        this.log.warn(`mirror image failed ${sanitizeUrlForDiagnostics(sourceUrl)}`);
        images.push({
          sourceUrl,
          storedUrl: null,
          watermarkedUrl: null,
          sortOrder: i,
          isMain: false,
          error: 'Stažení selhalo',
        });
      } else {
        images.push({
          sourceUrl,
          storedUrl: null,
          watermarkedUrl: null,
          sortOrder: i,
          isMain: false,
          error: 'Čeká na browser capture',
        });
      }
    }

    let browserCapture: Awaited<ReturnType<SrealityPlaywrightService['captureGalleryImages']>> | undefined;
    if (pendingBrowser.length > 0 || options?.enrichContact) {
      this.log.log(
        `SREALITY_BROWSER_MEDIA_PENDING count=${pendingBrowser.length} enrichContact=${Boolean(options?.enrichContact)}`,
      );
      browserCapture = await this.playwright.captureGalleryImages({
        listingUrl: sourceListingUrl,
        targetUrls: pendingBrowser.map((item) => item.sourceUrl),
        enrichContact: options?.enrichContact ?? false,
      });

      const capturedPool = new Map<
        string,
        NonNullable<typeof browserCapture>['captured'][number]
      >();
      for (const item of browserCapture.captured) {
        for (const key of matchKeysForImageUrl(item.sourceUrl)) {
          const existing = capturedPool.get(key);
          if (!existing || item.buffer.length > existing.buffer.length) {
            capturedPool.set(key, item);
          }
        }
      }

      for (const pending of pendingBrowser) {
        const captured = findBestCapturedForTargetUrl(pending.sourceUrl, capturedPool);
        const rowIndex = images.findIndex(
          (row) => row.sourceUrl === pending.sourceUrl && !row.storedUrl,
        );
        if (!captured) {
          if (rowIndex >= 0) {
            images[rowIndex] = {
              ...images[rowIndex]!,
              error: 'Browser capture selhal',
            };
          }
          const failIdx = imageDownloadFailures.findIndex((d) => d.index === pending.index + 1);
          const failDiag: SrealityImageDownloadFailureDiag = {
            index: pending.index + 1,
            host: (() => {
              try {
                return new URL(pending.sourceUrl).hostname;
              } catch {
                return '—';
              }
            })(),
            hostValidation: 'PASS',
            httpStatus: pending.directHttpStatus,
            directHttpStatus: pending.directHttpStatus,
            contentType: null,
            responseLength: null,
            redirectHost: null,
            error: 'Browser capture selhal',
            urlSample: sanitizeUrlForDiagnostics(pending.sourceUrl),
            sourceUrl: pending.sourceUrl,
            selectedUrl: pending.sourceUrl,
            browserResponse: 'FAIL',
            browserContext: 'FAIL',
            domBlob: 'FAIL',
            elementCapture: 'FAIL',
            storage: 'FAILED',
          };
          if (failIdx >= 0) imageDownloadFailures[failIdx] = failDiag;
          else pushImageDiag(failDiag);
          continue;
        }

        try {
          const ext = extFromContentType(captured.contentType);
          uploadAttempted += 1;
          const uploadedMedia = await this.propertyMediaCloudinary.uploadImageBufferWithWatermarkVariants(
            captured.buffer,
            `${storageKey}-${pending.index + 1}.${ext}`,
          );
          uploaded += 1;
          downloaded += 1;
          captureMethods[captured.method] = (captureMethods[captured.method] ?? 0) + 1;

          const storedRow: SrealityImportImageRow = {
            sourceUrl: pending.sourceUrl,
            storedUrl: uploadedMedia.originalUrl,
            watermarkedUrl: uploadedMedia.watermarkedUrl ?? null,
            sortOrder: pending.index,
            isMain: downloaded === 1,
          };
          if (rowIndex >= 0) images[rowIndex] = storedRow;
          else images.push(storedRow);

          const okIdx = imageDownloadFailures.findIndex((d) => d.index === pending.index + 1);
          const okDiag: SrealityImageDownloadFailureDiag = {
            index: pending.index + 1,
            host: (() => {
              try {
                return new URL(pending.sourceUrl).hostname;
              } catch {
                return '—';
              }
            })(),
            hostValidation: 'PASS',
            httpStatus: 200,
            directHttpStatus: pending.directHttpStatus,
            contentType: captured.contentType,
            responseLength: captured.buffer.length,
            redirectHost: null,
            error: '',
            urlSample: sanitizeUrlForDiagnostics(pending.sourceUrl),
            sourceUrl: pending.sourceUrl,
            selectedUrl: captured.sourceUrl,
            captureMethod: captured.method,
            mime: captured.contentType,
            bytes: captured.buffer.length,
            dimensions: `${captured.width}x${captured.height}`,
            browserResponse: captured.method === 'BROWSER_RESPONSE' ? 'PASS' : 'UNAVAILABLE',
            browserContext: captured.method === 'BROWSER_CONTEXT' ? 'PASS' : 'UNAVAILABLE',
            domBlob: captured.method === 'DOM_BLOB' ? 'PASS' : 'UNAVAILABLE',
            elementCapture: captured.method === 'ELEMENT_CAPTURE' ? 'PASS' : 'UNAVAILABLE',
            storage: 'UPLOADED',
          };
          if (okIdx >= 0) imageDownloadFailures[okIdx] = okDiag;
          else pushImageDiag(okDiag);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (rowIndex >= 0) {
            images[rowIndex] = {
              ...images[rowIndex]!,
              error: msg.slice(0, 120),
            };
          }
          const errIdx = imageDownloadFailures.findIndex((d) => d.index === pending.index + 1);
          const errDiag: SrealityImageDownloadFailureDiag = {
            index: pending.index + 1,
            host: (() => {
              try {
                return new URL(pending.sourceUrl).hostname;
              } catch {
                return '—';
              }
            })(),
            hostValidation: 'PASS',
            httpStatus: pending.directHttpStatus,
            directHttpStatus: pending.directHttpStatus,
            contentType: captured.contentType,
            responseLength: captured.buffer.length,
            redirectHost: null,
            error: msg.slice(0, 160),
            urlSample: sanitizeUrlForDiagnostics(pending.sourceUrl),
            sourceUrl: pending.sourceUrl,
            selectedUrl: captured.sourceUrl,
            captureMethod: captured.method,
            mime: captured.contentType,
            bytes: captured.buffer.length,
            dimensions: `${captured.width}x${captured.height}`,
            browserResponse: captured.method === 'BROWSER_RESPONSE' ? 'PASS' : 'UNAVAILABLE',
            browserContext: captured.method === 'BROWSER_CONTEXT' ? 'PASS' : 'UNAVAILABLE',
            domBlob: captured.method === 'DOM_BLOB' ? 'PASS' : 'UNAVAILABLE',
            elementCapture: captured.method === 'ELEMENT_CAPTURE' ? 'PASS' : 'UNAVAILABLE',
            storage: 'FAILED',
          };
          if (errIdx >= 0) imageDownloadFailures[errIdx] = errDiag;
          else pushImageDiag(errDiag);
        }
      }
    }

    if (images.length && !images.some((x) => x.isMain)) {
      const firstOk = images.find((x) => x.storedUrl);
      if (firstOk) firstOk.isMain = true;
    }

    const failed = unique.length - downloaded;
    const limitNote =
      found.length > unique.length
        ? `${found.length} fotografií nalezeno, ${unique.length} vybráno k importu (limit ${SREALITY_IMPORT_MAX_IMAGES}). `
        : '';
    const stats: SrealityImageImportStats = {
      found: found.length,
      requested: unique.length,
      downloaded,
      failed,
      uploaded,
      uploadAttempted,
      maxImagesLimit: SREALITY_IMPORT_MAX_IMAGES,
      imageDownloadFailures: imageDownloadFailures.length ? imageDownloadFailures : undefined,
      directHttpSuccess: captureMethods.DIRECT_HTTP ?? 0,
      browserResponseSuccess: captureMethods.BROWSER_RESPONSE ?? 0,
      browserContextSuccess: captureMethods.BROWSER_CONTEXT ?? 0,
      domBlobSuccess: captureMethods.DOM_BLOB ?? 0,
      elementCaptureSuccess: captureMethods.ELEMENT_CAPTURE ?? 0,
      captureMethods,
      message:
        failed > 0
          ? `${limitNote}Staženo ${downloaded}/${unique.length} fotografií. ${failed} fotografií se nepodařilo stáhnout.`
          : `${limitNote}Staženo ${downloaded}/${unique.length} fotografií.`,
    };

    return { images, stats, browserCapture };
  }

  private async downloadImageDirect(
    sourceUrl: string,
    referer: string,
    storageKey: string,
    index: number,
    onFailure?: (diag: SrealityImageDownloadFailureDiag) => void,
  ): Promise<{ storedUrl: string; watermarkedUrl: string | null } | null> {
    const candidates = buildSrealityImageFetchCandidates(sourceUrl);
    let lastDiag: SrealityImageDownloadFailureDiag | null = null;

    for (const candidate of candidates) {
      if (!isAllowedSrealityImageUrl(candidate)) continue;
      try {
        const res = await axios.get(candidate, {
          responseType: 'arraybuffer',
          timeout: 15_000,
          maxRedirects: 5,
          maxContentLength: MAX_IMAGE_BYTES,
          validateStatus: () => true,
          headers: srealityImageFetchHeaders(referer),
        });
        const ct = String(res.headers['content-type'] ?? '').toLowerCase();
        const buf = Buffer.from(res.data ?? []);
        const redirectHost = res.request?.res?.responseUrl
          ? (() => {
              try {
                return new URL(String(res.request.res.responseUrl)).hostname;
              } catch {
                return null;
              }
            })()
          : null;
        const finalUrl = res.request?.res?.responseUrl
          ? String(res.request.res.responseUrl)
          : candidate;
        const candidateHost = (() => {
          try {
            return new URL(candidate).hostname;
          } catch {
            return '—';
          }
        })();

        if (!isAllowedSrealityImageRedirectUrl(finalUrl)) {
          lastDiag = {
            index: index + 1,
            host: candidateHost,
            hostValidation: 'PASS',
            httpStatus: res.status,
            contentType: ct || null,
            responseLength: buf.length || null,
            redirectHost,
            error: 'Redirect na nepovolený hostitel',
            urlSample: sanitizeUrlForDiagnostics(candidate),
          };
          continue;
        }

        if (res.status < 200 || res.status >= 300) {
          lastDiag = {
            index: index + 1,
            host: candidateHost,
            hostValidation: 'PASS',
            httpStatus: res.status,
            contentType: ct || null,
            responseLength: buf.length || null,
            redirectHost,
            error: `HTTP ${res.status}`,
            urlSample: sanitizeUrlForDiagnostics(candidate),
          };
          continue;
        }
        if (!ct.startsWith('image/')) {
          lastDiag = {
            index: index + 1,
            host: candidateHost,
            hostValidation: 'PASS',
            httpStatus: res.status,
            contentType: ct || null,
            responseLength: buf.length || null,
            redirectHost,
            error: 'Neplatný content-type',
            urlSample: sanitizeUrlForDiagnostics(candidate),
          };
          continue;
        }
        if (buf.length < MIN_IMAGE_BYTES || buf.length > MAX_IMAGE_BYTES) {
          lastDiag = {
            index: index + 1,
            host: candidateHost,
            hostValidation: 'PASS',
            httpStatus: res.status,
            contentType: ct,
            responseLength: buf.length,
            redirectHost,
            error: `Neplatná velikost (${buf.length} B)`,
            urlSample: sanitizeUrlForDiagnostics(candidate),
          };
          continue;
        }

        const meta = await sharp(buf).metadata().catch(() => null);
        if (!meta?.width || !meta?.height) {
          lastDiag = {
            index: index + 1,
            host: candidateHost,
            hostValidation: 'PASS',
            httpStatus: res.status,
            contentType: ct,
            responseLength: buf.length,
            redirectHost,
            error: 'Obrázek se nepodařilo dekódovat',
            urlSample: sanitizeUrlForDiagnostics(candidate),
          };
          continue;
        }

        const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
        const uploaded = await this.propertyMediaCloudinary.uploadImageBufferWithWatermarkVariants(
          buf,
          `${storageKey}-${index + 1}.${ext}`,
        );
        return {
          storedUrl: uploaded.originalUrl,
          watermarkedUrl: uploaded.watermarkedUrl ?? null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        lastDiag = {
          index: index + 1,
          host: (() => {
            try {
              return new URL(candidate).hostname;
            } catch {
              return '—';
            }
          })(),
          hostValidation: validateSrealityMediaUrl(candidate).hostValidation,
          httpStatus: null,
          contentType: null,
          responseLength: null,
          redirectHost: null,
          error: msg.slice(0, 160),
          urlSample: sanitizeUrlForDiagnostics(candidate),
        };
      }
    }

    if (lastDiag && onFailure) onFailure(lastDiag);
    return null;
  }
}
