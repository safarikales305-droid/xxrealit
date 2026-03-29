import {
  Controller,
  Delete,
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
import { PropertiesService } from '../properties/properties.service';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly propertiesService: PropertiesService,
    private readonly jwt: JwtService,
  ) {}

  @Get(':id/properties')
  async listProperties(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.propertiesService.findByOwner(id, viewerId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  follow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.followUser(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/follow')
  unfollow(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.unfollowUser(user.id, id);
  }

  @Get(':id')
  async getProfile(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.usersService.getPublicProfile(id, viewerId);
  }
}
