import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  FetchListingSourceImagesDto,
  PrefillListingFromUrlDto,
} from './dto/prefill-listing-from-url.dto';
import { UnlockListingContactDto } from './dto/unlock-listing-contact.dto';
import { ListingContactUnlockService } from './listing-contact-unlock.service';
import { ListingsPrefillService } from './listings-prefill.service';
import { SrealityImportService } from './sreality-import.service';
import { PropertiesService } from './properties.service';

@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listingContactUnlock: ListingContactUnlockService,
    private readonly listingsPrefill: ListingsPrefillService,
    private readonly srealityImport: SrealityImportService,
    private readonly propertiesService: PropertiesService,
  ) {}

  @Get('locations')
  listLocations(@Query('q') q?: string, @Query('limit') limit?: string) {
    const limitNum = Number(limit);
    return this.propertiesService.getPublicListingLocations({
      q,
      limit: Number.isFinite(limitNum) ? limitNum : undefined,
    });
  }

  @Post('prefill-from-url')
  @UseGuards(JwtAuthGuard)
  prefillFromUrl(
    @CurrentUser() _user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PrefillListingFromUrlDto,
  ) {
    return this.srealityImport.prefillFromUrl(dto.sourceUrl).then((r) => {
      if (r.ok) return { ok: true as const, data: r.data };
      return { ok: false as const, error: r.error };
    });
  }

  @Post('fetch-source-images')
  @UseGuards(JwtAuthGuard)
  fetchSourceImages(
    @CurrentUser() _user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: FetchListingSourceImagesDto,
  ) {
    return this.srealityImport.fetchSourceImages(dto.urls);
  }

  @Post(':id/unlock-contact')
  @UseGuards(JwtAuthGuard)
  unlockContactLegacy(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UnlockListingContactDto,
  ) {
    return this.listingContactUnlock.unlockContact(user.id, id, dto);
  }

  @Post(':id/contact-unlock')
  @UseGuards(JwtAuthGuard)
  unlockContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UnlockListingContactDto,
  ) {
    return this.listingContactUnlock.unlockContact(user.id, id, dto);
  }
}
