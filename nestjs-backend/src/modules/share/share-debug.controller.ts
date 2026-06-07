import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ShareMetadataService } from './share-metadata.service';

@Controller('debug/share')
export class ShareDebugController {
  constructor(private readonly shareMeta: ShareMetadataService) {}

  @Get(':type/:id')
  async debug(@Param('type') type: string, @Param('id') id: string) {
    try {
      const meta = await this.shareMeta.resolveByType(type, id);
      return {
        shareUrl: meta.shareUrl,
        ogTitle: meta.ogTitle,
        ogDescription: meta.ogDescription,
        ogImage: meta.ogImage,
        contentType: meta.contentType,
        priceIncluded: meta.priceIncluded,
        adminTextSource: meta.adminTextSource,
        isLogoFallback: meta.isLogoFallback,
        warning: meta.warning,
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      throw new NotFoundException('Sdílení nenalezeno');
    }
  }
}
