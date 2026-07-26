import { Injectable } from '@nestjs/common';
import { PropertiesService } from '../properties/properties.service';

export type AiChatPropertyCard = {
  id: string;
  slug: string | null;
  title: string;
  city: string;
  layout: string | null;
  area: number | null;
  priceHidden: boolean;
  priceLabel: string | null;
  imageUrl: string | null;
  path: string;
  reason?: string;
};

@Injectable()
export class AiChatToolsService {
  constructor(private readonly properties: PropertiesService) {}

  async searchProperties(
    viewerId: string | undefined,
    params: {
      location?: string;
      propertyType?: string;
      offerType?: string;
      priceMin?: number;
      priceMax?: number;
      limit?: number;
    },
  ): Promise<AiChatPropertyCard[]> {
    const propertyTypeKey = this.mapPropertyType(params.propertyType);
    const { items: rows } = await this.properties.findAllPublic(viewerId, {
      location: params.location,
      propertyTypeKey,
      priceMin: params.priceMin,
      priceMax: params.priceMax,
    });

    const limit = Math.min(10, Math.max(1, params.limit ?? 5));
    const offer = (params.offerType ?? '').toLowerCase();

    return rows
      .filter((r) => {
        if (!offer) return true;
        const ot = String((r as { offerType?: string }).offerType ?? '').toLowerCase();
        if (offer.includes('pronaj') || offer.includes('rent')) {
          return ot.includes('pronaj') || ot.includes('nájem') || ot.includes('najem');
        }
        return ot.includes('prodej');
      })
      .slice(0, limit)
      .map((r) => {
        const rec = r as Record<string, unknown>;
        const slug = (rec.slug as string | null) ?? null;
        const id = String(rec.id);
        const price = rec.price as number | null | undefined;
        const priceHidden = !viewerId && price != null && price > 0;
        const imageUrl =
          (rec.mainImage as string | null) ??
          (rec.coverImage as string | null) ??
          (Array.isArray(rec.images) ? (rec.images[0] as string) : null) ??
          null;
        return {
          id,
          slug,
          title: String(rec.title ?? 'Nemovitost'),
          city: String(rec.city ?? ''),
          layout: (rec.layout as string | null) ?? (rec.disposition as string | null) ?? null,
          area: (rec.area as number | null) ?? (rec.usableArea as number | null) ?? null,
          priceHidden,
          priceLabel: priceHidden ? null : price != null && price > 0 ? `${price.toLocaleString('cs-CZ')} Kč` : null,
          imageUrl,
          path: slug ? `/nemovitost/${slug}` : `/nemovitost/${id}`,
        };
      });
  }

  getPublicPortalInformation(topic?: string) {
    const base = {
      name: 'XXREALIT',
      description: 'Moderní český realitní portál s video inzeráty, klasickými inzeráty a programatickým SEO.',
      registration: '/registrace',
      addListing: '/inzerat/pridat',
      agentRegistration: '/registrace?role=AGENT',
      companyRegistration: '/registrace?role=COMPANY',
      support: '/podpora',
      search: '/',
    };
    if (!topic) return base;
    return { ...base, topic };
  }

  private mapPropertyType(raw?: string): string | undefined {
    if (!raw) return undefined;
    const v = raw.toLowerCase();
    if (v.includes('byt')) return 'byt';
    if (v.includes('dum') || v.includes('dům') || v.includes('dom')) return 'dum';
    if (v.includes('pozem')) return 'pozemek';
    if (v.includes('garaz') || v.includes('garáž')) return 'garaz';
    return undefined;
  }
}
