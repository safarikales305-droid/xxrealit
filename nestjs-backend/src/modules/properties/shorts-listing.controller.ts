import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { propertyMediaMemoryMulterOptions } from '../upload/multer-upload.config';
import { CreateShortsFromClassicDto } from './dto/create-shorts-from-classic.dto';
import { UpdateShortsListingDto } from './dto/update-shorts-listing.dto';
import { ReorderShortsMediaDto } from './dto/reorder-shorts-media.dto';
import { AddShortsMediaUrlDto } from './dto/add-shorts-media-url.dto';
import { PatchShortsMediaDto } from './dto/patch-shorts-media.dto';
import { ShortsListingService } from './shorts-listing.service';

@Controller('shorts-listings')
export class ShortsListingController {
  constructor(private readonly shortsListingService: ShortsListingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  listMine(@CurrentUser() user: AuthUser) {
    return this.shortsListingService.listMine(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shortsListingService.getByIdForOwner(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('from-classic/:propertyId')
  createFromClassic(
    @CurrentUser() user: AuthUser,
    @Param('propertyId') propertyId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateShortsFromClassicDto,
  ) {
    return this.shortsListingService.createDraftFromClassic(user.id, propertyId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: UpdateShortsListingDto,
  ) {
    return this.shortsListingService.updateDraft(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shortsListingService.deleteListing(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/preview')
  preview(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shortsListingService.previewVideo(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/publish')
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shortsListingService.publish(user.id, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/media/reorder')
  reorder(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: ReorderShortsMediaDto,
  ) {
    return this.shortsListingService.reorderMedia(user.id, id, dto.orderedIds);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cover/:mediaId')
  setCover(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.shortsListingService.setCover(user.id, id, mediaId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/media/by-url')
  addByUrl(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: AddShortsMediaUrlDto,
  ) {
    return this.shortsListingService.addMediaByUrl(user.id, id, dto.imageUrl);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/media/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      ...propertyMediaMemoryMulterOptions,
      limits: { fileSize: 20 * 1024 * 1024, files: 1 },
    }),
  )
  uploadMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor chybí (pole „file“).');
    }
    return this.shortsListingService.uploadMediaFile(user.id, id, file);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/media/:mediaId')
  patchMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: PatchShortsMediaDto,
  ) {
    return this.shortsListingService.patchMedia(user.id, id, mediaId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/media/:mediaId')
  deleteMedia(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.shortsListingService.deleteMedia(user.id, id, mediaId);
  }
}
