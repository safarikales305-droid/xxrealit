import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../admin/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePortalTermsVersionDto } from './dto/create-portal-terms-version.dto';
import { UpdatePortalTermsVersionDto } from './dto/update-portal-terms-version.dto';
import { PortalTermsService } from './portal-terms.service';

@Controller('admin/portal-terms')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PortalTermsAdminController {
  constructor(private readonly terms: PortalTermsService) {}

  @Get('versions')
  listVersions() {
    return this.terms.listVersions();
  }

  @Get('versions/:id')
  getVersion(@Param('id') id: string) {
    return this.terms.getVersion(id);
  }

  @Post('versions')
  createVersion(@CurrentUser() user: AuthUser, @Body() dto: CreatePortalTermsVersionDto) {
    return this.terms.createVersion(user.id, dto);
  }

  @Patch('versions/:id')
  updateVersion(@Param('id') id: string, @Body() dto: UpdatePortalTermsVersionDto) {
    return this.terms.updateVersion(id, dto);
  }

  @Post('versions/:id/publish')
  publishVersion(@Param('id') id: string) {
    return this.terms.publishVersion(id);
  }

  @Post('versions/:id/unpublish')
  unpublishVersion(@Param('id') id: string) {
    return this.terms.unpublishVersion(id);
  }
}
