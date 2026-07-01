import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TikTokVideoUrlService } from './tiktok-video-url.service';

@Controller('public/tiktok-video')
export class TikTokPublicVideoController {
  constructor(private readonly videoUrls: TikTokVideoUrlService) {}

  @Get(':listingId')
  async streamVideo(@Param('listingId') listingId: string, @Res() res: Response) {
    const sourceUrl = await this.videoUrls.resolveSourceVideoUrl(listingId);
    if (!sourceUrl) {
      throw new NotFoundException('Video není dostupné.');
    }

    const upstream = await fetch(sourceUrl, { redirect: 'follow' });
    if (!upstream.ok || !upstream.body) {
      throw new NotFoundException('Video není dostupné.');
    }

    const contentType = upstream.headers.get('content-type') ?? 'video/mp4';
    res.setHeader('Content-Type', contentType.includes('video') ? contentType : 'video/mp4');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(upstream.status);

    const reader = upstream.body.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      res.write(Buffer.from(value));
      await pump();
    };
    await pump();
  }
}
