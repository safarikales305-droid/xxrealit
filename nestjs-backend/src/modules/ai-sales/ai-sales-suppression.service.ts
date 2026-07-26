import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AiSalesSuppressionService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  extractDomain(email: string): string | null {
    const parts = this.normalizeEmail(email).split('@');
    return parts.length === 2 ? parts[1] : null;
  }

  async isSuppressed(email: string | null | undefined): Promise<{ suppressed: boolean; reason?: string }> {
    if (!email) return { suppressed: false };
    const normalized = this.normalizeEmail(email);
    const domain = this.extractDomain(normalized);

    const [byEmail, byDomain, prospect] = await Promise.all([
      this.prisma.aiSalesSuppression.findFirst({ where: { email: normalized } }),
      domain
        ? this.prisma.aiSalesSuppression.findFirst({ where: { domain } })
        : Promise.resolve(null),
      this.prisma.aiSalesProspect.findFirst({
        where: {
          OR: [{ email: normalized }, { doNotContact: true, email: normalized }],
        },
        select: { doNotContact: true, doNotContactReason: true },
      }),
    ]);

    if (byEmail) return { suppressed: true, reason: byEmail.reason ?? 'SUPPRESSION_LIST' };
    if (byDomain) return { suppressed: true, reason: byDomain.reason ?? 'DOMAIN_SUPPRESSED' };
    if (prospect?.doNotContact) {
      return { suppressed: true, reason: prospect.doNotContactReason ?? 'DO_NOT_CONTACT' };
    }
    return { suppressed: false };
  }

  async addSuppression(input: {
    email?: string;
    domain?: string;
    reason?: string;
    source?: string;
  }) {
    const email = input.email ? this.normalizeEmail(input.email) : null;
    const domain = input.domain ?? (email ? this.extractDomain(email) : null);
    return this.prisma.aiSalesSuppression.create({
      data: {
        email,
        domain,
        reason: input.reason,
        source: input.source ?? 'MANUAL',
      },
    });
  }
}
