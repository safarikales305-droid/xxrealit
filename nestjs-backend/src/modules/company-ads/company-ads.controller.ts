import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Query,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAdsService } from './company-ads.service';
import { CreateCompanyAdDto } from './dto/create-company-ad.dto';
import { UpdateCompanyAdDto } from './dto/update-company-ad.dto';

function assertCompany(user: AuthUser) {
  if (user.role !== UserRole.COMPANY) {
    throw new ForbiddenException('Reklamy mohou spravovat jen stavební firmy.');
  }
}

@Controller('company-ads')
export class CompanyAdsController {
  constructor(private readonly companyAds: CompanyAdsService) {}

  /** Veřejné — pro lazy load ve feedu (bez JWT). */
  @Get('for-property/:propertyId')
  forProperty(@Param('propertyId') propertyId: string) {
    return this.companyAds.resolveForProperty(propertyId);
  }

  /** Veřejné batch načtení relevantních reklam pro feed. */
  @Get('for-feed')
  forFeed(@Query('propertyIds') propertyIdsRaw: string) {
    const propertyIds = String(propertyIdsRaw ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
    return this.companyAds.resolveForFeed(propertyIds);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthUser) {
    assertCompany(user);
    return this.companyAds.listMine(user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateCompanyAdDto,
  ) {
    assertCompany(user);
    return this.companyAds.create(user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateCompanyAdDto,
  ) {
    assertCompany(user);
    return this.companyAds.update(user.id, id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    assertCompany(user);
    return this.companyAds.remove(user.id, id);
  }
}
