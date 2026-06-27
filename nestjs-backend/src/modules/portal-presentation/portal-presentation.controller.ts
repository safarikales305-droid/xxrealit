import { Controller, Get, Post, Body, Query, Req, Header } from '@nestjs/common';
import { extractRequestClientMeta } from '../../common/request-client-meta';
import { TrackAnalyticsDto } from './dto/portal-presentation.dto';
import { PortalPresentationService } from './portal-presentation.service';

@Controller('portal-presentation')
export class PortalPresentationController {
  constructor(private readonly presentation: PortalPresentationService) {}

  @Get('public')
  getPublic(@Query('locale') locale?: string) {
    return this.presentation.getPublic(locale ?? 'cs');
  }

  @Get('search')
  search(@Query('q') q?: string, @Query('locale') locale?: string) {
    return this.presentation.searchPublic(typeof q === 'string' ? q : '', locale ?? 'cs');
  }

  @Get('rss')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  async rss(@Query('locale') locale?: string) {
    const { page, base, items } = await this.presentation.buildRss(locale ?? 'cs');
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${esc(page.metaTitle)}</title>
<link>${esc(`${base}/o-portalu`)}</link>
<description>${esc(page.metaDescription)}</description>
<language>${esc(page.locale)}</language>
<lastBuildDate>${new Date(page.updatedAt).toUTCString()}</lastBuildDate>
${items
  .map(
    (i) => `<item>
<title>${esc(i.title)}</title>
<link>${esc(i.link)}</link>
<description>${esc(i.description)}</description>
<pubDate>${new Date(i.pubDate).toUTCString()}</pubDate>
</item>`,
  )
  .join('\n')}
</channel>
</rss>`;
    return xml;
  }

  @Post('analytics')
  track(
    @Body() dto: TrackAnalyticsDto,
    @Query('locale') locale?: string,
    @Req() req?: { headers?: Record<string, string | string[] | undefined> },
  ) {
    const meta = req ? extractRequestClientMeta(req) : { ip: null, userAgent: null };
    return this.presentation.trackAnalytics(locale ?? 'cs', dto, meta.userAgent);
  }
}
