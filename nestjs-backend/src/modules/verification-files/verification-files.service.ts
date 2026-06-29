import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  VERIFICATION_FILE_MAX_BYTES,
  mimeTypeForVerificationFilename,
  validateVerificationFilename,
} from './verification-files.utils';

@Injectable()
export class VerificationFilesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForAdmin() {
    const rows = await this.prisma.verificationFile.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        uploadedBy: r.uploadedBy,
      })),
    };
  }

  async uploadForAdmin(adminId: string, file: Express.Multer.File) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Soubor nebyl nahrán.');
    }
    if (file.size > VERIFICATION_FILE_MAX_BYTES) {
      throw new BadRequestException('Maximální velikost souboru je 1 MB.');
    }

    const originalName = file.originalname || file.filename || '';
    const validation = validateVerificationFilename(originalName);
    if (!validation.ok || !validation.normalized) {
      throw new BadRequestException(validation.error ?? 'Neplatný název souboru.');
    }

    const filename = validation.normalized;
    const mimeType = mimeTypeForVerificationFilename(filename);
    const content = file.buffer.toString('utf8');

    if (!content.trim()) {
      throw new BadRequestException('Soubor je prázdný.');
    }

    const existing = await this.prisma.verificationFile.findUnique({
      where: { filename },
    });
    if (existing) {
      throw new ConflictException('Soubor s tímto názvem již existuje. Nejprve ho smažte.');
    }

    const row = await this.prisma.verificationFile.create({
      data: {
        filename,
        mimeType,
        content,
        uploadedByAdminId: adminId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      ok: true,
      item: {
        id: row.id,
        filename: row.filename,
        mimeType: row.mimeType,
        isActive: row.isActive,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        uploadedBy: row.uploadedBy,
      },
    };
  }

  async setActiveForAdmin(id: string, isActive: boolean) {
    const row = await this.prisma.verificationFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Soubor nenalezen.');

    const updated = await this.prisma.verificationFile.update({
      where: { id },
      data: { isActive },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      ok: true,
      item: {
        id: updated.id,
        filename: updated.filename,
        mimeType: updated.mimeType,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        uploadedBy: updated.uploadedBy,
      },
    };
  }

  async deleteForAdmin(id: string) {
    const row = await this.prisma.verificationFile.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Soubor nenalezen.');
    await this.prisma.verificationFile.delete({ where: { id } });
    return { ok: true };
  }

  async getPublicFile(filename: string) {
    const validation = validateVerificationFilename(filename);
    if (!validation.ok || !validation.normalized) {
      return null;
    }

    const row = await this.prisma.verificationFile.findFirst({
      where: { filename: validation.normalized, isActive: true },
    });
    if (!row) return null;

    return {
      filename: row.filename,
      mimeType: row.mimeType,
      content: row.content,
    };
  }
}
