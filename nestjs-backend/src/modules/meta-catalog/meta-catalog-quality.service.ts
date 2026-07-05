import { Injectable } from '@nestjs/common';
import type { MetaCatalogExportRecord } from './meta-catalog-feed.service';

export type QualityCheck = {
  key: string;
  label: string;
  level: 'ok' | 'warning' | 'error';
  message: string;
};

export type QualityReport = {
  score: number;
  checks: QualityCheck[];
  summary: { ok: number; warning: number; error: number };
};

@Injectable()
export class MetaCatalogQualityService {
  runQualityCheck(
    items: Array<{ id: string; record: MetaCatalogExportRecord }>,
  ): QualityReport {
    const checks: QualityCheck[] = [];
    const seenIds = new Set<string>();
    const seenUrls = new Set<string>();

    for (const item of items) {
      const r = item.record;
      const prefix = item.id;

      const mainImage = String(r.main_image ?? r.image_link ?? '');
      checks.push(
        mainImage.startsWith('http')
          ? { key: `${prefix}_main_image`, label: 'Hlavní fotografie', level: 'ok', message: 'OK' }
          : { key: `${prefix}_main_image`, label: 'Hlavní fotografie', level: 'error', message: 'Chybí' },
      );

      const gallery = r.gallery;
      checks.push(
        Array.isArray(gallery) && gallery.length > 0
          ? { key: `${prefix}_gallery`, label: 'Galerie', level: 'ok', message: `${gallery.length} fotek` }
          : { key: `${prefix}_gallery`, label: 'Galerie', level: 'warning', message: 'Prázdná galerie' },
      );

      const video = String(r.video ?? '');
      checks.push(
        video.startsWith('http')
          ? { key: `${prefix}_video`, label: 'Video', level: 'ok', message: 'OK' }
          : { key: `${prefix}_video`, label: 'Video', level: 'warning', message: 'Chybí video' },
      );

      const price = String(r.price ?? '');
      checks.push(
        price.trim()
          ? { key: `${prefix}_price`, label: 'Cena', level: 'ok', message: price }
          : { key: `${prefix}_price`, label: 'Cena', level: 'error', message: 'Chybí cena' },
      );

      const availability = String(r.availability ?? '');
      checks.push(
        availability === 'in stock'
          ? { key: `${prefix}_availability`, label: 'Dostupnost', level: 'ok', message: 'in stock' }
          : { key: `${prefix}_availability`, label: 'Dostupnost', level: 'error', message: 'Neplatná' },
      );

      const url = String(r.url ?? r.link ?? '');
      checks.push(
        url.startsWith('http')
          ? { key: `${prefix}_url`, label: 'URL', level: 'ok', message: 'OK' }
          : { key: `${prefix}_url`, label: 'URL', level: 'error', message: 'Neplatná URL' },
      );

      const city = String(r.city ?? '');
      checks.push(
        city.trim()
          ? { key: `${prefix}_city`, label: 'Město', level: 'ok', message: city }
          : { key: `${prefix}_city`, label: 'Město', level: 'warning', message: 'Chybí město' },
      );

      const desc = String(r.description ?? '');
      checks.push(
        desc.length >= 50
          ? { key: `${prefix}_description`, label: 'Popis', level: 'ok', message: `${desc.length} znaků` }
          : { key: `${prefix}_description`, label: 'Popis', level: 'warning', message: 'Krátký popis' },
      );

      const ptype = String(r.property_type ?? '');
      checks.push(
        ptype.trim()
          ? { key: `${prefix}_property_type`, label: 'Typ nemovitosti', level: 'ok', message: ptype }
          : { key: `${prefix}_property_type`, label: 'Typ nemovitosti', level: 'warning', message: 'Chybí' },
      );

      const offer = String(r.offer_type ?? '');
      checks.push(
        offer.trim()
          ? { key: `${prefix}_offer_type`, label: 'Typ nabídky', level: 'ok', message: offer }
          : { key: `${prefix}_offer_type`, label: 'Typ nabídky', level: 'warning', message: 'Chybí' },
      );

      if (seenIds.has(item.id)) {
        checks.push({ key: `${prefix}_dup_id`, label: 'Duplicita ID', level: 'error', message: 'Duplicitní ID' });
      }
      seenIds.add(item.id);

      if (url && seenUrls.has(url)) {
        checks.push({ key: `${prefix}_dup_url`, label: 'Duplicita URL', level: 'error', message: 'Duplicitní URL' });
      }
      if (url) seenUrls.add(url);
    }

    const summary = { ok: 0, warning: 0, error: 0 };
    for (const c of checks) summary[c.level] += 1;
    const total = checks.length || 1;
    const score = Math.round(((summary.ok + summary.warning * 0.5) / total) * 100);

    return { score, checks, summary };
  }
}
