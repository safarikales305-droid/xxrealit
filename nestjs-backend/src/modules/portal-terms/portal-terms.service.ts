import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreatePortalTermsVersionDto } from './dto/create-portal-terms-version.dto';
import type { UpdatePortalTermsVersionDto } from './dto/update-portal-terms-version.dto';

const authorSelect = { id: true, name: true, email: true } as const;

export type PortalTermsClientMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class PortalTermsService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: {
    id: string;
    version: number;
    title: string;
    termsHtml: string;
    rulesHtml: string;
    operatorContact: string;
    isPublished: boolean;
    requireReacceptOnLogin: boolean;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    createdBy?: { id: string; name: string; email: string } | null;
  }) {
    return {
      id: row.id,
      version: row.version,
      title: row.title,
      termsHtml: row.termsHtml,
      rulesHtml: row.rulesHtml,
      operatorContact: row.operatorContact,
      isPublished: row.isPublished,
      requireReacceptOnLogin: row.requireReacceptOnLogin,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdBy: row.createdBy ?? null,
    };
  }

  async getCurrentPublished() {
    const row = await this.prisma.portalTermsVersion.findFirst({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
      include: { createdBy: { select: authorSelect } },
    });
    return row ? this.serialize(row) : null;
  }

  async listVersions() {
    const rows = await this.prisma.portalTermsVersion.findMany({
      orderBy: { version: 'desc' },
      include: { createdBy: { select: authorSelect } },
    });
    return {
      items: rows.map((row) => this.serialize(row)),
      total: rows.length,
      current: rows.find((r) => r.isPublished) ?? null,
    };
  }

  async getVersion(id: string) {
    const row = await this.prisma.portalTermsVersion.findUnique({
      where: { id },
      include: { createdBy: { select: authorSelect } },
    });
    if (!row) throw new NotFoundException('Verze nenalezena');
    return this.serialize(row);
  }

  private async nextVersionNumber(tx: Prisma.TransactionClient): Promise<number> {
    const max = await tx.portalTermsVersion.aggregate({ _max: { version: true } });
    return (max._max.version ?? 0) + 1;
  }

  async createVersion(adminId: string, dto: CreatePortalTermsVersionDto) {
    const title = dto.title.trim();
    const termsHtml = dto.termsHtml.trim();
    const rulesHtml = dto.rulesHtml.trim();
    const operatorContact = dto.operatorContact.trim();
    if (!title || !termsHtml || !rulesHtml || !operatorContact) {
      throw new BadRequestException('Všechna pole musí být vyplněna');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const version = await this.nextVersionNumber(tx);
      const created = await tx.portalTermsVersion.create({
        data: {
          version,
          title,
          termsHtml,
          rulesHtml,
          operatorContact,
          requireReacceptOnLogin: dto.requireReacceptOnLogin === true,
          createdById: adminId,
        },
        include: { createdBy: { select: authorSelect } },
      });

      if (dto.publish === true) {
        await tx.portalTermsVersion.updateMany({
          where: { id: { not: created.id }, isPublished: true },
          data: { isPublished: false },
        });
        return tx.portalTermsVersion.update({
          where: { id: created.id },
          data: { isPublished: true, publishedAt: new Date() },
          include: { createdBy: { select: authorSelect } },
        });
      }

      return created;
    });

    return this.serialize(row);
  }

  async updateVersion(id: string, dto: UpdatePortalTermsVersionDto) {
    const existing = await this.prisma.portalTermsVersion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Verze nenalezena');

    const data: Prisma.PortalTermsVersionUpdateInput = {};
    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (!title) throw new BadRequestException('Název nesmí být prázdný');
      data.title = title;
    }
    if (dto.termsHtml !== undefined) {
      const termsHtml = dto.termsHtml.trim();
      if (!termsHtml) throw new BadRequestException('Text obchodních podmínek nesmí být prázdný');
      data.termsHtml = termsHtml;
    }
    if (dto.rulesHtml !== undefined) {
      const rulesHtml = dto.rulesHtml.trim();
      if (!rulesHtml) throw new BadRequestException('Pravidla portálu nesmí být prázdná');
      data.rulesHtml = rulesHtml;
    }
    if (dto.operatorContact !== undefined) {
      const operatorContact = dto.operatorContact.trim();
      if (!operatorContact) throw new BadRequestException('Kontakt provozovatele je povinný');
      data.operatorContact = operatorContact;
    }
    if (dto.requireReacceptOnLogin !== undefined) {
      data.requireReacceptOnLogin = dto.requireReacceptOnLogin;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Žádná pole k aktualizaci');
    }

    const row = await this.prisma.portalTermsVersion.update({
      where: { id },
      data,
      include: { createdBy: { select: authorSelect } },
    });
    return this.serialize(row);
  }

  async publishVersion(id: string) {
    const existing = await this.prisma.portalTermsVersion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Verze nenalezena');

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.portalTermsVersion.updateMany({
        where: { isPublished: true },
        data: { isPublished: false },
      });
      return tx.portalTermsVersion.update({
        where: { id },
        data: { isPublished: true, publishedAt: new Date() },
        include: { createdBy: { select: authorSelect } },
      });
    });

    return this.serialize(row);
  }

  async unpublishVersion(id: string) {
    const existing = await this.prisma.portalTermsVersion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Verze nenalezena');

    const row = await this.prisma.portalTermsVersion.update({
      where: { id },
      data: { isPublished: false },
      include: { createdBy: { select: authorSelect } },
    });
    return this.serialize(row);
  }

  async userNeedsReaccept(userId: string): Promise<boolean> {
    const [user, current] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { termsVersion: true, role: true },
      }),
      this.prisma.portalTermsVersion.findFirst({
        where: { isPublished: true },
        orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
        select: { version: true, requireReacceptOnLogin: true },
      }),
    ]);

    if (!user || user.role === 'ADMIN' || !current) return false;
    if (!current.requireReacceptOnLogin) return false;
    if (user.termsVersion == null) return true;
    return user.termsVersion < current.version;
  }

  async acceptTermsForUser(userId: string, meta?: PortalTermsClientMeta) {
    const current = await this.prisma.portalTermsVersion.findFirst({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }],
    });
    if (!current) {
      throw new BadRequestException('Nejsou publikovány žádné obchodní podmínky');
    }

    const ip = meta?.ip?.trim().slice(0, 64) || null;
    const userAgent = meta?.userAgent?.trim().slice(0, 512) || null;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        termsAccepted: true,
        termsAcceptedAt: new Date(),
        termsVersion: current.version,
        termsIp: ip,
        termsUserAgent: userAgent,
      },
    });

    return {
      termsAccepted: true,
      termsVersion: current.version,
      termsAcceptedAt: new Date().toISOString(),
    };
  }

  async assertRegistrationConsent(termsAccepted: boolean | undefined) {
    if (termsAccepted !== true) {
      throw new HttpException(
        {
          error: 'Musíte souhlasit s obchodními podmínkami a pravidly portálu',
          fieldErrors: {
            termsAccepted: ['Musíte souhlasit s obchodními podmínkami a pravidly portálu'],
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const current = await this.getCurrentPublished();
    if (!current) {
      throw new HttpException(
        { error: 'Obchodní podmínky nejsou momentálně k dispozici' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return current.version;
  }

  termsConsentData(version: number, meta?: PortalTermsClientMeta) {
    const ip = meta?.ip?.trim().slice(0, 64) || null;
    const userAgent = meta?.userAgent?.trim().slice(0, 512) || null;
    return {
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      termsVersion: version,
      termsIp: ip,
      termsUserAgent: userAgent,
    };
  }
}
