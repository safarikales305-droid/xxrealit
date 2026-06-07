import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LinkPreviewDto } from './dto/link-preview.dto';
import { LinkPreviewService } from './link-preview.service';

@Controller('link-preview')
export class LinkPreviewController {
  constructor(private readonly linkPreview: LinkPreviewService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  fetch(@Body() dto: LinkPreviewDto) {
    return this.linkPreview.fetchPreview(dto.url);
  }
}
