import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../admin/guards/admin.guard';
import { PromoProfilesService } from './promo-profiles.service';
import { BulkPromoProfilesDto } from './dto/bulk-promo-profiles.dto';
import { isPromoProfileRole } from './promo-profile-role.util';
import { ProfileImagesService } from '../upload/profile-images.service';

const PROFILE_UPLOAD_MAX_BYTES = 8 * 1024 * 1024;

const noBodyValidation = new ValidationPipe({
  whitelist: false,
  forbidNonWhitelisted: false,
  transform: false,
  validateCustomDecorators: false,
});

type CreatePromoBody = {
  firstName?: string;
  lastName?: string;
  role?: string;
  isPublic?: string | boolean;
  active?: string | boolean;
};

function parseBool(v: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return fallback;
}

@Controller('admin/promo-profiles')
@UseGuards(JwtAuthGuard, AdminGuard)
export class PromoProfilesAdminController {
  constructor(
    private readonly promoProfiles: PromoProfilesService,
    private readonly profileImages: ProfileImagesService,
  ) {}

  @Get()
  list() {
    return this.promoProfiles.listForAdmin();
  }

  @Get('generate-name')
  generateName() {
    return this.promoProfiles.generateName();
  }

  @Post('bulk')
  bulk(@Body() dto: BulkPromoProfilesDto) {
    return this.promoProfiles.bulkAction(dto.ids, dto.action);
  }

  @Post()
  @UsePipes(noBodyValidation)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: PROFILE_UPLOAD_MAX_BYTES },
    }),
  )
  async create(
    @Body() body: CreatePromoBody,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const roleRaw = String(body.role ?? '').trim();
    if (!isPromoProfileRole(roleRaw)) {
      throw new BadRequestException('Vyberte platnou roli promo profilu.');
    }
    if (file?.buffer?.length) {
      await this.profileImages.validateRasterInput(
        file.buffer,
        file.mimetype,
        file.originalname,
      );
    }
    return this.promoProfiles.create(
      {
        firstName: String(body.firstName ?? '').trim(),
        lastName: String(body.lastName ?? '').trim(),
        role: roleRaw as UserRole,
        isPublic: parseBool(body.isPublic, true),
        active: parseBool(body.active, true),
      },
      file?.buffer,
    );
  }
}
