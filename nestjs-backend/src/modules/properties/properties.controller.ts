import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertiesService } from './properties.service';

@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly jwt: JwtService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('following')
  followingFeed(@CurrentUser() user: AuthUser) {
    return this.propertiesService.findFromFollowedUsers(user.id);
  }

  @Get()
  findAll(@Headers('authorization') auth?: string) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.propertiesService.findAllPublic(viewerId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.propertiesService.findOneForDetail(id, viewerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/like')
  toggleLike(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.propertiesService.toggleLike(id, user.id);
  }

  @Post()
  create(@Body() createPropertyDto: CreatePropertyDto) {
    return this.propertiesService.create(createPropertyDto);
  }
}
