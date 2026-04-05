import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FavoritesService } from './favorites.service';

@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.favoritesService.list(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':propertyId')
  add(
    @CurrentUser() user: AuthUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.favoritesService.add(user.id, propertyId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':propertyId')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('propertyId') propertyId: string,
  ) {
    return this.favoritesService.remove(user.id, propertyId);
  }
}
