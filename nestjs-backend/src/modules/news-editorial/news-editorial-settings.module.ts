import { Module } from '@nestjs/common';
import { NewsEditorialSettingsService } from './news-editorial-settings.service';

/** Lehký modul bez závislosti na Social/Properties — použitelný z autopost bez circular dependency. */
@Module({
  providers: [NewsEditorialSettingsService],
  exports: [NewsEditorialSettingsService],
})
export class NewsEditorialSettingsModule {}
