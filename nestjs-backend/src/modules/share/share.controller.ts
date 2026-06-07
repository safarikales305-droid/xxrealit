import { Controller, Get } from '@nestjs/common';
import { DEFAULT_SHARE_TEXTS, ShareTextsSettingsService } from './share-texts-settings.service';

@Controller('share-texts')
export class ShareTextsController {
  constructor(private readonly shareTexts: ShareTextsSettingsService) {}

  @Get()
  async getPublic() {
    const settings = await this.shareTexts.getSettings();
    return { ...DEFAULT_SHARE_TEXTS, ...settings };
  }
}
