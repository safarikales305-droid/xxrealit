import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { CreateDeveloperNoteDto } from './dto/create-developer-note.dto';
import type { UpdateDeveloperNoteDto } from './dto/update-developer-note.dto';

const CATEGORIES = new Set([
  'BUG',
  'TEST',
  'IDEA',
  'DEPLOYMENT',
  'WHATSAPP',
  'CREDITS',
  'LISTINGS',
  'PWA',
]);

@Injectable()
export class DeveloperNotesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeCategory(value: string): string {
    const upper = value.trim().toUpperCase();
    if (!CATEGORIES.has(upper)) {
      return 'TEST';
    }
    return upper;
  }

  async list(filters: { q?: string; category?: string; status?: string }) {
    const q = filters.q?.trim() ?? '';
    const category = filters.category?.trim().toUpperCase() ?? '';
    const status = filters.status?.trim().toUpperCase() ?? '';

    const rows = await this.prisma.developerNote.findMany({
      where: {
        ...(category ? { category } : {}),
        ...(status ? { status } : {}),
        ...(q
          ? {
              body: { contains: q, mode: 'insensitive' as const },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });

    return {
      items: rows.map((row) => this.serialize(row)),
      total: rows.length,
    };
  }

  async create(authorId: string, dto: CreateDeveloperNoteDto) {
    const row = await this.prisma.developerNote.create({
      data: {
        category: this.normalizeCategory(dto.category),
        body: dto.body.trim(),
        status: dto.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN',
        authorId,
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });
    return this.serialize(row);
  }

  async update(id: string, dto: UpdateDeveloperNoteDto) {
    const existing = await this.prisma.developerNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Poznámka nenalezena');

    const row = await this.prisma.developerNote.update({
      where: { id },
      data: {
        ...(dto.body !== undefined ? { body: dto.body.trim() } : {}),
        ...(dto.category !== undefined
          ? { category: this.normalizeCategory(dto.category) }
          : {}),
        ...(dto.status !== undefined
          ? { status: dto.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN' }
          : {}),
      },
      include: {
        author: { select: { id: true, name: true, email: true } },
      },
    });
    return this.serialize(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.developerNote.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Poznámka nenalezena');
    await this.prisma.developerNote.delete({ where: { id } });
    return { ok: true };
  }

  private serialize(row: {
    id: string;
    category: string;
    status: string;
    body: string;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; name: string | null; email: string };
  }) {
    return {
      id: row.id,
      category: row.category,
      status: row.status,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.author.id,
        name: row.author.name,
        email: row.author.email,
      },
    };
  }
}
