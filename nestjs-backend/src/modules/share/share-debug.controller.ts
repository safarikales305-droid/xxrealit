import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ShareMetadataService } from './share-metadata.service';

@Controller('debug')
export class ShareDebugController {
  constructor(private readonly shareMeta: ShareMetadataService) {}

  @Get('share-url')
  diagnoseShareUrl(@Query('id') id?: string, @Query('type') type?: string) {
    if (!id?.trim() || !type?.trim()) {
      throw new NotFoundException('Parametry id a type jsou povinné');
    }
    return this.shareMeta.diagnoseShareUrl(id.trim(), type.trim());
  }

  @Get('share/:type/:id')
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
