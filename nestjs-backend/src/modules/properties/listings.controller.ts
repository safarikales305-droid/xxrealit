import {
  Body,
  Controller,
  Param,
  Post,
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

@Controller('listings')
export class ListingsController {
  constructor(
    private readonly listingContactUnlock: ListingContactUnlockService,
    private readonly listingsPrefill: ListingsPrefillService,
  ) {}

  @Post('prefill-from-url')
  @UseGuards(JwtAuthGuard)
  prefillFromUrl(
    @CurrentUser() _user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: PrefillListingFromUrlDto,
  ) {
    return this.listingsPrefill.prefillFromUrl(dto.sourceUrl);
  }

  @Post('fetch-source-images')
  @UseGuards(JwtAuthGuard)
  fetchSourceImages(
    @CurrentUser() _user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: FetchListingSourceImagesDto,
  ) {
    return this.listingsPrefill.fetchSourceImages(dto.urls);
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
