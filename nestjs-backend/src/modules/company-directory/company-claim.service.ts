import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyClaimRequestStatus,
  CompanyDirectoryProfileStatus,
  CompanyDirectoryVerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CompanyClaimService {
  constructor(private readonly prisma: PrismaService) {}

  async submitClaim(input: {
    companyId?: string;
    slug?: string;
    ico: string;
    contactName: string;
    contactEmail: string;
    contactPhone?: string;
    userId?: string;
  }) {
    const normalizedIco = input.ico.replace(/\D/g, '').padStart(8, '0');
    if (normalizedIco.length !== 8) {
      throw new BadRequestException('IČO musí mít 8 číslic.');
    }

    const company = input.companyId
      ? await this.prisma.companyDirectoryEntry.findUnique({ where: { id: input.companyId } })
      : input.slug
        ? await this.prisma.companyDirectoryEntry.findFirst({
            where: { OR: [{ slug: input.slug }, { ico: normalizedIco }] },
          })
        : await this.prisma.companyDirectoryEntry.findUnique({ where: { ico: normalizedIco } });

    if (!company) {
      throw new NotFoundException('Firemní profil pro převzetí nebyl nalezen.');
    }

    if (company.ico !== normalizedIco) {
      throw new BadRequestException('Zadané IČO neodpovídá profilu firmy.');
    }

    if (
      company.profileStatus === CompanyDirectoryProfileStatus.CLAIMED ||
      company.profileStatus === CompanyDirectoryProfileStatus.VERIFIED
    ) {
      throw new BadRequestException('Tento profil již byl převzat.');
    }

    const pending = await this.prisma.companyClaimRequest.findFirst({
      where: {
        companyId: company.id,
        status: { in: [CompanyClaimRequestStatus.PENDING, CompanyClaimRequestStatus.UNDER_REVIEW] },
      },
    });
    if (pending) {
      throw new BadRequestException('Žádost o převzetí tohoto profilu již čeká na vyřízení.');
    }

    return this.prisma.companyClaimRequest.create({
      data: {
        companyId: company.id,
        userId: input.userId ?? null,
        ico: normalizedIco,
        contactName: input.contactName.trim(),
        contactEmail: input.contactEmail.trim().toLowerCase(),
        contactPhone: input.contactPhone?.trim() || null,
        status: CompanyClaimRequestStatus.PENDING,
      },
    });
  }

  async listClaims(status?: string) {
    return this.prisma.companyClaimRequest.findMany({
      where: status
        ? { status: status as CompanyClaimRequestStatus }
        : undefined,
      include: {
        company: { select: { id: true, name: true, slug: true, ico: true } },
        user: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async reviewClaim(
    claimId: string,
    action: 'approve' | 'reject',
    adminNote?: string,
  ) {
    const claim = await this.prisma.companyClaimRequest.findUnique({
      where: { id: claimId },
      include: { company: true },
    });
    if (!claim) throw new NotFoundException('Žádost nenalezena.');

    if (action === 'approve') {
      await this.prisma.$transaction([
        this.prisma.companyClaimRequest.update({
          where: { id: claimId },
          data: {
            status: CompanyClaimRequestStatus.APPROVED,
            adminNote: adminNote ?? null,
          },
        }),
        this.prisma.companyDirectoryEntry.update({
          where: { id: claim.companyId },
          data: {
            profileStatus: CompanyDirectoryProfileStatus.CLAIMED,
            verificationStatus: CompanyDirectoryVerificationStatus.PENDING,
            claimedAt: new Date(),
            claimedByUserId: claim.userId,
          },
        }),
      ]);
      return { ok: true, status: 'APPROVED' };
    }

    await this.prisma.companyClaimRequest.update({
      where: { id: claimId },
      data: {
        status: CompanyClaimRequestStatus.REJECTED,
        adminNote: adminNote ?? null,
      },
    });
    return { ok: true, status: 'REJECTED' };
  }
}
