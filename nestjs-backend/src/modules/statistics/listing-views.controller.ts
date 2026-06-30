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
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RecordListingViewDto } from './dto/record-listing-view.dto';
import { ListingViewsService } from './listing-views.service';

@Controller('listings')
export class ListingViewsController {
  constructor(private readonly listingViews: ListingViewsService) {}

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  recordView(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | null,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: RecordListingViewDto,
  ) {
    return this.listingViews.recordView(id, dto.source, {
      userId: user?.id ?? null,
      visitorId: dto.visitorId ?? null,
    });
  }
}
