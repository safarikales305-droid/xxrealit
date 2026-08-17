import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from '../../lib/sharp-instance';
import { getUploadsPath } from '../../lib/uploads-path';
import { resolveAssetBaseUrl } from '../../lib/image-url';
import {
  formatCzechReviewCount,
  formatRatingValue,
  formatStarRating,
} from './company-review-social.util';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

@Injectable()
export class CompanyReviewSocialCardService {
  private readonly log = new Logger(CompanyReviewSocialCardService.name);

  async generateReviewCard(input: {
    companyName: string;
    reviewExcerpt: string;
    averageRating: number | null;
    reviewCount: number;
    singleReviewRating: number;
    reviewId: string;
  }): Promise<string | null> {
    try {
      const stars = formatStarRating(input.singleReviewRating);
      const avg = formatRatingValue(input.averageRating, input.singleReviewRating);
      const countLabel = formatCzechReviewCount(input.reviewCount);
      const excerpt = escapeXml(input.reviewExcerpt.trim().slice(0, 140) || 'Nová zákaznická zkušenost');
      const companyName = escapeXml(input.companyName.slice(0, 80));

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ff6a00"/>
      <stop offset="100%" style="stop-color:#ff3c00"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#ffffff"/>
  <rect x="0" y="0" width="1200" height="12" fill="url(#accent)"/>
  <text x="72" y="88" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#e85d00">XXREALIT</text>
  <text x="72" y="138" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700" fill="#111827">NOVÁ RECENZE</text>
  <text x="72" y="210" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="700" fill="#111827">${companyName}</text>
  <text x="72" y="280" font-family="Arial, Helvetica, sans-serif" font-size="40" fill="#f59e0b">${stars}</text>
  <text x="72" y="330" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#111827">${avg} / 5</text>
  <text x="72" y="372" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#4b5563">${escapeXml(countLabel)}</text>
  <rect x="72" y="410" width="1056" height="120" rx="16" fill="#fff7ed" stroke="#fed7aa"/>
  <text x="96" y="460" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#374151">„${excerpt}"</text>
  <text x="72" y="580" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" fill="#e85d00">Zobrazit profil na XXREALIT</text>
</svg>`;

      const png = await sharp(Buffer.from(svg)).png().toBuffer();
      const dir = join(getUploadsPath(), 'company-reviews', 'cards');
      await mkdir(dir, { recursive: true });
      const filename = `review-card-${input.reviewId}.png`;
      const filePath = join(dir, filename);
      await writeFile(filePath, png);
      const base = resolveAssetBaseUrl()?.replace(/\/+$/, '') ?? '';
      return `${base}/uploads/company-reviews/cards/${filename}`;
    } catch (err) {
      this.log.warn(
        `Review social card generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}
