import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ReorderSectionsDto,
  UpdatePresentationPageDto,
  UpsertFaqDto,
  UpsertPresentationSectionDto,
} from './dto/portal-presentation.dto';
import { PortalPresentationService } from './portal-presentation.service';

@Controller('admin/portal-presentation')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PortalPresentationAdminController {
  constructor(private readonly presentation: PortalPresentationService) {}

  @Get()
  getAdmin(@Query('locale') locale?: string) {
    return this.presentation.getAdmin(locale ?? 'cs');
  }

  @Patch()
  updatePage(@Query('locale') locale: string | undefined, @Body() dto: UpdatePresentationPageDto) {
    return this.presentation.updatePage(locale ?? 'cs', dto);
  }

  @Post('sections')
  upsertSection(
    @Query('locale') locale: string | undefined,
    @Body() dto: UpsertPresentationSectionDto,
  ) {
    return this.presentation.upsertSection(locale ?? 'cs', dto);
  }

  @Delete('sections/:id')
  deleteSection(@Param('id') id: string) {
    return this.presentation.deleteSection(id);
  }

  @Post('sections/reorder')
  reorder(@Query('locale') locale: string | undefined, @Body() dto: ReorderSectionsDto) {
    return this.presentation.reorderSections(locale ?? 'cs', dto);
  }

  @Post('faq')
  upsertFaq(@Query('locale') locale: string | undefined, @Body() dto: UpsertFaqDto) {
    return this.presentation.upsertFaq(locale ?? 'cs', dto);
  }

  @Delete('faq/:id')
  deleteFaq(@Param('id') id: string) {
    return this.presentation.deleteFaq(id);
  }

  @Get('analytics')
  analytics(@Query('locale') locale?: string, @Query('days') days?: string) {
    const n = Number(days);
    return this.presentation.getAnalyticsSummary(locale ?? 'cs', Number.isFinite(n) ? n : 30);
  }
}
