import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertiesService } from '../properties/properties.service';
import { UpdateAvatarDto } from './dto/update-avatar.dto';
import { UpdateCoverDto } from './dto/update-cover.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateBrokerLeadPrefsDto } from './dto/update-broker-lead-prefs.dto';
import { UsersService } from './users.service';
import { BrokerPointsService } from '../premium-broker/broker-points.service';
import { UserRole } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly propertiesService: PropertiesService,
    private readonly jwt: JwtService,
    private readonly brokerPoints: BrokerPointsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.usersService.getMeProfile(user.id);
    if (!profile) {
      throw new NotFoundException();
    }
    const brokerProgress =
      profile.role === UserRole.AGENT
        ? await this.brokerPoints.getProgress(user.id)
        : null;
    return { ...profile, brokerProgress };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/broker-lead-prefs')
  async patchBrokerLeadPrefs(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateBrokerLeadPrefsDto,
  ) {
    return this.usersService.updateBrokerLeadPrefs(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('avatar')
  async patchAvatar(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateAvatarDto,
  ) {
    const updated = await this.usersService.updateAvatar(
      user.id,
      dto.avatarUrl.trim(),
    );
    return {
      success: true,
      avatarUrl: updated.avatar,
      coverImageUrl: updated.coverImage ?? null,
      bio: updated.bio ?? null,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        avatarUrl: updated.avatar ?? null,
        coverImageUrl: updated.coverImage ?? null,
        bio: updated.bio ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async patchProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    const updated = await this.usersService.updateProfileBio(user.id, dto.bio);
    return {
      success: true,
      bio: updated.bio ?? null,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        avatarUrl: updated.avatar ?? null,
        coverImageUrl: updated.coverImage ?? null,
        bio: updated.bio ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cover')
  async patchCover(@CurrentUser() user: AuthUser, @Body() dto: UpdateCoverDto) {
    const updated = await this.usersService.updateCoverImage(
      user.id,
      dto.coverImageUrl.trim(),
    );
    return {
      success: true,
      coverImageUrl: updated.coverImage ?? null,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        avatarUrl: updated.avatar ?? null,
        coverImageUrl: updated.coverImage ?? null,
        bio: updated.bio ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Delete('cover')
  async deleteCover(@CurrentUser() user: AuthUser) {
    const updated = await this.usersService.clearCoverImage(user.id);
    return {
      success: true,
      coverImageUrl: null,
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        avatarUrl: updated.avatar ?? null,
        coverImageUrl: null,
        bio: updated.bio ?? null,
        createdAt: updated.createdAt.toISOString(),
      },
    };
  }

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
