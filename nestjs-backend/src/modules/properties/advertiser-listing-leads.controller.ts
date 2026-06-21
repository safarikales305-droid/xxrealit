import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ListingContactUnlockService } from './listing-contact-unlock.service';

@Controller('users/me/listing-leads')
@UseGuards(JwtAuthGuard)
export class AdvertiserListingLeadsController {
  constructor(private readonly listingContactUnlock: ListingContactUnlockService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.listingContactUnlock.listAdvertiserLeads(user.id);
  }

  @Post('unlock-pending')
  unlockPending(@CurrentUser() user: AuthUser) {
    return this.listingContactUnlock.unlockPendingLeadsForUser(user.id);
  }
}
