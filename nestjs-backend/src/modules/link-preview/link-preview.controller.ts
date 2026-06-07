import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { buildLinkPreviewFallback } from './link-preview-fallback.util';
import { LinkPreviewDto } from './dto/link-preview.dto';
import { LinkPreviewService } from './link-preview.service';

@Controller('link-preview')
export class LinkPreviewController {
  constructor(private readonly linkPreview: LinkPreviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async fetch(@Body() dto: LinkPreviewDto) {
    try {
      return await this.linkPreview.fetchPreview(dto.url);
    } catch {
      return buildLinkPreviewFallback(dto.url);
    }
  }
}
