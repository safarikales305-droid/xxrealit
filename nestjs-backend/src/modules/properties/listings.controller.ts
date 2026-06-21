import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UnlockListingContactDto } from './dto/unlock-listing-contact.dto';
import { ListingContactUnlockService } from './listing-contact-unlock.service';

@Controller('listings')
export class ListingsController {
  constructor(private readonly listingContactUnlock: ListingContactUnlockService) {}

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
