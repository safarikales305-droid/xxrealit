import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { normalizeToE164 } from '../modules/whatsapp/whatsapp-phone.util';
import {
  EMAIL_ALREADY_REGISTERED_MSG,
  ICO_ALREADY_USED_MSG,
  ICO_UNIQUE_ROLES,
  WHATSAPP_ALREADY_USED_MSG,
  isIcoUniqueRole,
  normalizeProfileIco,
} from './account-uniqueness.constants';

@Injectable()
export class AccountUniquenessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertEmailAvailable(email: string, excludeUserId?: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return;
    const existing = await this.prisma.user.findFirst({
      where: {
        email: normalized,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new HttpException(
        { error: EMAIL_ALREADY_REGISTERED_MSG, code: 'EMAIL_EXISTS' },
        HttpStatus.CONFLICT,
      );
    }
  }

  async assertWhatsAppPhoneAvailable(phoneRaw: string, excludeUserId: string): Promise<void> {
    const phone = normalizeToE164(phoneRaw.trim());
    if (!phone) return;

    const other = await this.prisma.user.findFirst({
      where: {
        id: { not: excludeUserId },
        OR: [
          { whatsappVerifiedPhone: phone },
          {
            whatsappVerified: true,
            whatsappPhone: phone,
          },
        ],
      },
      select: { id: true },
    });
    if (other) {
      throw new BadRequestException(WHATSAPP_ALREADY_USED_MSG);
    }
  }

  async findUserIdByIco(ico: string): Promise<string | null> {
    const normalized = normalizeProfileIco(ico);
    if (!normalized) return null;

    const byUserIco = await this.prisma.user.findFirst({
      where: {
        profileIco: normalized,
        role: { in: [...ICO_UNIQUE_ROLES] },
      },
      select: { id: true },
    });
    if (byUserIco) return byUserIco.id;

    const [agent, agency, company, advisor] = await Promise.all([
      this.prisma.agentProfile.findFirst({
        where: { ico: normalized },
        select: { userId: true },
      }),
      this.prisma.agencyProfile.findFirst({
        where: { ico: normalized },
        select: { userId: true },
      }),
      this.prisma.companyProfile.findFirst({
        where: { ico: normalized },
        select: { userId: true },
      }),
      this.prisma.financialAdvisorProfile.findFirst({
        where: { ico: normalized },
        select: { userId: true },
      }),
    ]);

    const profileUserId =
      agent?.userId ?? agency?.userId ?? company?.userId ?? advisor?.userId ?? null;
    if (!profileUserId) return null;

    const owner = await this.prisma.user.findUnique({
      where: { id: profileUserId },
      select: { id: true, role: true },
    });
    if (!owner || !isIcoUniqueRole(owner.role)) return null;
    return owner.id;
  }

  async assertIcoAvailable(
    ico: string | null | undefined,
    userId: string,
    role: UserRole,
  ): Promise<void> {
    if (!isIcoUniqueRole(role)) return;
    const normalized = normalizeProfileIco(ico);
    if (!normalized) return;

    const otherId = await this.findUserIdByIco(normalized);
    if (otherId && otherId !== userId) {
      throw new BadRequestException(ICO_ALREADY_USED_MSG);
    }
  }

  /** Admin může uvolnit IČO — nastaví null na uživateli i v profilu role. */
  async adminReleaseIco(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new BadRequestException('Uživatel nenalezen.');

    await this.prisma.user.update({
      where: { id: userId },
      data: { profileIco: null },
    });

    await Promise.all([
      this.prisma.agentProfile.updateMany({
        where: { userId },
        data: { ico: '' },
      }),
      this.prisma.agencyProfile.updateMany({
        where: { userId },
        data: { ico: '' },
      }),
      this.prisma.companyProfile.updateMany({
        where: { userId },
        data: { ico: '' },
      }),
      this.prisma.financialAdvisorProfile.updateMany({
        where: { userId },
        data: { ico: '' },
      }),
    ]);

    return { ok: true };
  }

  async adminChangeEmail(userId: string, emailRaw: string): Promise<{ ok: true; email: string }> {
    const email = emailRaw.trim().toLowerCase();
    await this.assertEmailAvailable(email, userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { email, emailVerified: false, emailVerifiedAt: null },
    });
    return { ok: true, email };
  }
}
