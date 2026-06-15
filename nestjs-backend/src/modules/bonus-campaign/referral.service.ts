import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';

function generateReferralCode(): string {
  return randomBytes(5).toString('hex').toUpperCase().slice(0, 8);
}

@Injectable()
export class ReferralService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureReferralCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (user?.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateReferralCode();
      try {
        const updated = await this.prisma.user.update({
          where: { id: userId },
          data: { referralCode: code },
          select: { referralCode: true },
        });
        return updated.referralCode!;
      } catch {
        /* collision */
      }
    }
    throw new Error('Nepodařilo se vygenerovat referral kód.');
  }

  async resolveReferrerByCode(code: string | null | undefined): Promise<string | null> {
    const normalized = String(code ?? '').trim().toUpperCase();
    if (!normalized) return null;
    const user = await this.prisma.user.findFirst({
      where: { referralCode: normalized },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  async getReferralInfo(userId: string, siteBaseUrl: string) {
    const code = await this.ensureReferralCode(userId);
    const base = siteBaseUrl.replace(/\/$/, '');
    const [emailCount, whatsappCount, referralRegistrations] = await Promise.all([
      this.prisma.referralInvite.count({ where: { inviterUserId: userId, channel: 'EMAIL' } }),
      this.prisma.referralInvite.count({ where: { inviterUserId: userId, channel: 'WHATSAPP' } }),
      this.prisma.user.count({ where: { referredByUserId: userId } }),
    ]);
    return {
      referralCode: code,
      referralUrl: `${base}/register?ref=${encodeURIComponent(code)}`,
      stats: {
        emailInvites: emailCount,
        whatsappInvites: whatsappCount,
        registrations: referralRegistrations,
      },
    };
  }

  async logInvite(userId: string, channel: 'EMAIL' | 'WHATSAPP', target?: string | null) {
    await this.prisma.referralInvite.create({
      data: {
        inviterUserId: userId,
        channel,
        target: target?.trim() || null,
      },
    });
    return { ok: true as const };
  }

  async countInvites(userId: string, channel: 'EMAIL' | 'WHATSAPP'): Promise<number> {
    return this.prisma.referralInvite.count({
      where: { inviterUserId: userId, channel },
    });
  }
}
