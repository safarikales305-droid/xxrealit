import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { parseBearerUserId } from '../auth/auth-token.util';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { TiparService } from './tipar.service';
import { UnlockListingContactDto } from '../properties/dto/unlock-listing-contact.dto';
import { CreateTiparPostDto } from './dto/create-tipar-post.dto';
import { UpdateTiparPostDto } from './dto/update-tipar-post.dto';

@Controller('tipar')
export class TiparController {
  constructor(
    private readonly tipar: TiparService,
    private readonly jwt: JwtService,
  ) {}

  @Post('activate')
  @UseGuards(JwtAuthGuard)
  activate(@CurrentUser() user: AuthUser) {
    return this.tipar.activateTipar(user.id);
  }

  @Get('posts/me')
  @UseGuards(JwtAuthGuard)
  listMine(@CurrentUser() user: AuthUser) {
    return this.tipar.listMyPosts(user.id);
  }

  @Get('posts/user/:userId')
  listByUser(
    @Param('userId') userId: string,
    @Headers('authorization') auth?: string,
  ) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.tipar.listPublicByUser(userId, viewerId);
  }

  @Get('posts/:id')
  getOne(@Param('id') id: string, @Headers('authorization') auth?: string) {
    const viewerId = parseBearerUserId(this.jwt, auth);
    return this.tipar.getPostForViewer(id, viewerId);
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateTiparPostDto,
  ) {
    return this.tipar.createPost(user.id, dto);
  }

  @Patch('posts/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateTiparPostDto,
  ) {
    return this.tipar.updatePost(user, id, dto);
  }

  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tipar.deletePost(user, id);
  }

  @Post('posts/:id/unlock-contact')
  @UseGuards(JwtAuthGuard)
  unlockContact(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: UnlockListingContactDto,
  ) {
    return this.tipar.unlockContact(user.id, id, dto);
  }
}
