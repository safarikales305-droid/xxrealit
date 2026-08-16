import { Injectable, Logger } from '@nestjs/common';
import { CompanyGoogleMatchStatus } from '@prisma/client';
import {
  GOOGLE_COMPANY_ENRICHMENT_ENABLED,
  GOOGLE_PLACES_API_KEY,
  GOOGLE_PLACES_CACHE_TTL_MS,
} from './company-directory.constants';
import type {
  CompanyReputationProvider,
  CompanyReputationSnapshot,
} from './company-reputation.provider';
import {
  autoApplyGoogleMatch,
  scoreGooglePlaceMatch,
  type GoogleMatchInput,
  type GooglePlaceCandidate,
} from './company-google-match.util';

type PlacesSearchResponse = {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    formattedAddress?: string;
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    reviews?: Array<Record<string, unknown>>;
  }>;
};

type PlaceDetailsResponse = {
  id?: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: Array<Record<string, unknown>>;
};

@Injectable()
export class GooglePlacesReputationProvider implements CompanyReputationProvider {
  readonly providerId = 'google_places';
  private readonly log = new Logger(GooglePlacesReputationProvider.name);
  private requestsToday = 0;

  isEnabled(): boolean {
    return GOOGLE_COMPANY_ENRICHMENT_ENABLED && Boolean(GOOGLE_PLACES_API_KEY);
  }

  getMetrics() {
    return { requestsToday: this.requestsToday };
  }

  async matchPlace(input: GoogleMatchInput): Promise<
    (CompanyReputationSnapshot & {
      matchStatus: CompanyGoogleMatchStatus;
      matchScore: number;
    }) | null
  > {
    if (!this.isEnabled()) return null;

    const query = [input.companyName, input.street, input.city, input.postalCode]
      .filter(Boolean)
      .join(', ');

    const places = await this.searchText(query);
    if (!places || places.length === 0) {
      return {
        placeId: null,
        displayName: null,
        rating: null,
        userRatingCount: null,
        googleMapsUri: null,
        reviews: [],
        matchConfidence: null,
        matchStatus: CompanyGoogleMatchStatus.NOT_FOUND,
        matchScore: 0,
      };
    }

    let best: GooglePlaceCandidate | null = null;
    let bestScore = 0;
    let bestStatus: CompanyGoogleMatchStatus = CompanyGoogleMatchStatus.REVIEW_REQUIRED;

    for (const place of places) {
      const candidate: GooglePlaceCandidate = {
        placeId: place.id ?? '',
        displayName: place.displayName?.text ?? '',
        formattedAddress: place.formattedAddress,
        rating: place.rating ?? null,
        userRatingCount: place.userRatingCount ?? null,
        googleMapsUri: place.googleMapsUri ?? null,
      };
      const { score, status } = scoreGooglePlaceMatch(input, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestStatus = status;
        best = candidate;
      }
    }

    if (!best?.placeId) return null;

    return {
      placeId: best.placeId,
      displayName: best.displayName,
      rating: best.rating,
      userRatingCount: best.userRatingCount,
      googleMapsUri: best.googleMapsUri,
      reviews: [],
      matchConfidence:
        bestStatus === CompanyGoogleMatchStatus.MATCHED_HIGH
          ? 'HIGH'
          : bestStatus === CompanyGoogleMatchStatus.MATCHED_MEDIUM
            ? 'MEDIUM'
            : 'LOW',
      matchStatus: bestStatus,
      matchScore: bestScore,
    };
  }

  async fetchReputation(placeId: string): Promise<CompanyReputationSnapshot | null> {
    if (!this.isEnabled() || !placeId) return null;
    const details = await this.getPlaceDetails(placeId);
    if (!details) return null;

    return {
      placeId: details.id ?? placeId,
      displayName: details.displayName?.text ?? null,
      rating: details.rating ?? null,
      userRatingCount: details.userRatingCount ?? null,
      googleMapsUri: details.googleMapsUri ?? null,
      reviews: (details.reviews ?? []).map((r) => sanitizeGoogleReview(r)),
      matchConfidence: null,
    };
  }

  shouldAutoApply(status: CompanyGoogleMatchStatus): boolean {
    return autoApplyGoogleMatch(status);
  }

  cacheExpiresAt(): Date {
    return new Date(Date.now() + GOOGLE_PLACES_CACHE_TTL_MS);
  }

  private async searchText(textQuery: string): Promise<NonNullable<PlacesSearchResponse['places']>> {
    this.requestsToday += 1;
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri',
      },
      body: JSON.stringify({ textQuery, languageCode: 'cs', regionCode: 'CZ', maxResultCount: 5 }),
    });
    if (!res.ok) {
      const body = await res.text();
      this.log.warn(`Google Places search failed ${res.status}: ${body.slice(0, 200)}`);
      throw new Error(`Google Places HTTP ${res.status}`);
    }
    const json = (await res.json()) as PlacesSearchResponse;
    return json.places ?? [];
  }

  private async getPlaceDetails(placeId: string): Promise<PlaceDetailsResponse | null> {
    this.requestsToday += 1;
    const id = placeId.startsWith('places/') ? placeId : `places/${placeId}`;
    const res = await fetch(`https://places.googleapis.com/v1/${id}`, {
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask':
          'id,displayName,rating,userRatingCount,googleMapsUri,reviews.authorAttribution,reviews.rating,reviews.text,reviews.publishTime,reviews.relativePublishTimeDescription',
      },
    });
    if (!res.ok) {
      this.log.warn(`Google Places details failed ${res.status} for ${placeId}`);
      return null;
    }
    return (await res.json()) as PlaceDetailsResponse;
  }
}

function sanitizeGoogleReview(raw: Record<string, unknown>): Record<string, unknown> {
  const text = raw.text as { text?: string } | undefined;
  const author = raw.authorAttribution as Record<string, unknown> | undefined;
  return {
    rating: raw.rating ?? null,
    text: text?.text ?? null,
    publishTime: raw.publishTime ?? null,
    relativePublishTimeDescription: raw.relativePublishTimeDescription ?? null,
    authorAttribution: author
      ? {
          displayName: author.displayName ?? null,
          uri: author.uri ?? null,
          photoUri: author.photoUri ?? null,
        }
      : null,
  };
}
