import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { propertyTotalViews, postTotalLikes } from '../../common/listing-statistics.util';
import { PrismaService } from '../../database/prisma.service';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateListingViewsSettingsDto } from './dto/update-listing-views-settings.dto';
import { UpdatePostLikesSettingsDto } from './dto/update-post-likes-settings.dto';
import { UpdateStatisticsSettingsDto } from './dto/update-statistics-settings.dto';
import { ListingViewsService } from './listing-views.service';
import { StatisticsSettingsService } from './statistics-settings.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class StatisticsAdminController {
  constructor(
    private readonly settings: StatisticsSettingsService,
    private readonly prisma: PrismaService,
    private readonly listingViews: ListingViewsService,
  ) {}

  @Get('statistics-settings')
  getSettings() {
    return this.settings.get();
  }

  @Put('statistics-settings')
  updateSettings(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateStatisticsSettingsDto,
  ) {
    return this.settings.update(dto);
  }

  @Patch('listings/:id/views-settings')
  async updateListingViews(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdateListingViewsSettingsDto,
  ) {
    const existing = await this.prisma.property.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, error: 'Inzerát nenalezen.' };
    }

    const data: Record<string, unknown> = {};

    if (dto.manualViews !== undefined) {
      data.manualViews = Math.max(0, Math.trunc(dto.manualViews));
    }
    if (dto.viewsCount !== undefined) {
      data.manualViews = Math.max(0, Math.trunc(dto.viewsCount));
    }
    if (dto.viewsAutopilotEnabled !== undefined) {
      data.viewsAutopilotEnabled = dto.viewsAutopilotEnabled;
      data.autoViewsEnabled = dto.viewsAutopilotEnabled;
      data.lastAutopilotViewsAt = dto.viewsAutopilotEnabled ? new Date() : null;
      data.lastAutoViewsAt = dto.viewsAutopilotEnabled ? new Date() : null;
    }
    if (dto.autoViewsEnabled !== undefined) {
      data.viewsAutopilotEnabled = dto.autoViewsEnabled;
      data.autoViewsEnabled = dto.autoViewsEnabled;
      data.lastAutopilotViewsAt = dto.autoViewsEnabled ? new Date() : null;
      data.lastAutoViewsAt = dto.autoViewsEnabled ? new Date() : null;
    }
    if (dto.viewsAutopilotRatePerHour !== undefined) {
      data.viewsAutopilotRatePerHour = dto.viewsAutopilotRatePerHour;
    }
    if (dto.viewsAutopilotRateMin !== undefined) {
      data.viewsAutopilotRateMin = dto.viewsAutopilotRateMin;
    }
    if (dto.viewsAutopilotRateMax !== undefined) {
      data.viewsAutopilotRateMax = dto.viewsAutopilotRateMax;
    }
    if (dto.viewsAutopilotIntervalMinutes !== undefined) {
      data.viewsAutopilotIntervalMinutes = dto.viewsAutopilotIntervalMinutes;
    }
    if (dto.viewsAutopilotMaxPerDay !== undefined) {
      data.viewsAutopilotMaxPerDay = dto.viewsAutopilotMaxPerDay;
    }
    if (dto.viewsAutopilotMaxTotal !== undefined) {
      data.viewsAutopilotMaxTotal = dto.viewsAutopilotMaxTotal;
    }
    if (dto.autoViewsIncrement !== undefined) {
      data.autoViewsIncrement = dto.autoViewsIncrement;
      data.viewsAutopilotRatePerHour = dto.autoViewsIncrement;
    }
    if (dto.autoViewsIntervalMinutes !== undefined) {
      data.autoViewsIntervalMinutes = dto.autoViewsIntervalMinutes;
      data.viewsAutopilotIntervalMinutes = dto.autoViewsIntervalMinutes;
    }

    const updated = await this.prisma.property.update({
      where: { id },
      data,
    });

    const total = propertyTotalViews(updated);
    if (total !== updated.viewsCount) {
      await this.listingViews.syncPropertyViewsCount(id);
    }

    const fresh = await this.prisma.property.findUnique({ where: { id } });
    return {
      ok: true,
      realViews: fresh?.realViews ?? 0,
      manualViews: fresh?.manualViews ?? 0,
      autopilotViews: fresh?.autopilotViews ?? 0,
      totalViews: propertyTotalViews(fresh ?? {}),
      viewsAutopilotEnabled: fresh?.viewsAutopilotEnabled ?? true,
    };
  }

  @Patch('posts/:id/likes-settings')
  async updatePostLikes(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UpdatePostLikesSettingsDto,
  ) {
    const existing = await this.prisma.post.findUnique({ where: { id } });
    if (!existing) return { ok: false, error: 'Příspěvek nenalezen.' };

    const data: Record<string, unknown> = {};
    if (dto.manualLikes !== undefined) {
      data.manualLikes = Math.max(0, Math.trunc(dto.manualLikes));
    }
    if (dto.likesAutopilotEnabled !== undefined) {
      data.likesAutopilotEnabled = dto.likesAutopilotEnabled;
      data.lastAutopilotLikesAt = dto.likesAutopilotEnabled ? new Date() : null;
    }
    if (dto.likesAutopilotRatePerHour !== undefined) {
      data.likesAutopilotRatePerHour = dto.likesAutopilotRatePerHour;
    }
    if (dto.likesAutopilotMaxTotal !== undefined) {
      data.likesAutopilotMaxTotal = dto.likesAutopilotMaxTotal;
    }

    const updated = await this.prisma.post.update({ where: { id }, data });
    return {
      ok: true,
      realLikes: updated.realLikes,
      manualLikes: updated.manualLikes,
      autopilotLikes: updated.autopilotLikes,
      totalLikes: postTotalLikes(updated),
      likesAutopilotEnabled: updated.likesAutopilotEnabled,
    };
  }
}
