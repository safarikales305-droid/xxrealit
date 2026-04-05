import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PropertiesService } from '../properties/properties.service';
import { UsersService } from './users.service';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly propertiesService: PropertiesService,
    private readonly jwt: JwtService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.usersService.getMeProfile(user.id);
    if (!profile) {
      throw new NotFoundException();
    }
    return profile;
  }

  @UseGuards(JwtAuthGuard)
  @Post('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @UploadedFile()
    file?: { buffer: Buffer; originalname?: string; mimetype?: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor je povinný');
    }
    const ext = extname(file.originalname || '').toLowerCase() || '.jpg';
    if (!IMAGE_EXT.has(ext)) {
      throw new BadRequestException('Povolené formáty: JPG, PNG, WebP, GIF');
    }
    const name = `${randomUUID()}${ext}`;
    const dir = join(process.cwd(), 'uploads', 'avatars');
    await mkdir(dir, { recursive: true });
    const abs = join(dir, name);
    await writeFile(abs, file.buffer);
    const avatarUrl = `/uploads/avatars/${name}`;
    await this.usersService.updateAvatar(user.id, avatarUrl);
    return { avatarUrl, success: true };
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
