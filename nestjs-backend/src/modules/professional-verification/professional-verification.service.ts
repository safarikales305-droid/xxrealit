import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AgentVerificationStatus,
  ProfessionalVerificationStatus,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { RequestProfessionalVerificationDto } from './dto/request-professional-verification.dto';
import {
  collectVerificationBlockingIssues,
  type VerificationEligibilityInput,
} from './professional-verification-eligibility.util';
import {
  isProfessionalRole,
  mapUserStatusToAgentStatus,
  professionalRoleLabel,
} from './professional-verification-sync.util';
import {
  assertWhatsAppVerified,
  WHATSAPP_VERIFY_PROFESSIONAL_MSG,
} from '../whatsapp/whatsapp-verification-required.util';

@Injectable()
export class ProfessionalVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private async syncProfileVerificationStatus(
    userId: string,
    role: UserRole,
    status: ProfessionalVerificationStatus,
    isPublic: boolean,
  ) {
    const agentStatus = mapUserStatusToAgentStatus(status);
    const updates: Promise<unknown>[] = [];
    if (role === UserRole.AGENT) {
      updates.push(
        this.prisma.agentProfile.updateMany({
          where: { userId },
          data: { verificationStatus: agentStatus, isPublic },
        }),
      );
    } else if (role === UserRole.COMPANY) {
      updates.push(
        this.prisma.companyProfile.updateMany({
          where: { userId },
          data: { verificationStatus: agentStatus, isPublic },
        }),
      );
    } else if (role === UserRole.AGENCY) {
      updates.push(
        this.prisma.agencyProfile.updateMany({
          where: { userId },
          data: { verificationStatus: agentStatus, isPublic },
        }),
      );
    } else if (role === UserRole.FINANCIAL_ADVISOR) {
      updates.push(
        this.prisma.financialAdvisorProfile.updateMany({
          where: { userId },
          data: { verificationStatus: agentStatus, isPublic },
        }),
      );
    } else if (role === UserRole.INVESTOR) {
      updates.push(
        this.prisma.investorProfile.updateMany({
          where: { userId },
          data: { verificationStatus: agentStatus, isPublic },
        }),
      );
    }
    await Promise.all(updates);
  }

  async requestVerification(userId: string, dto: RequestProfessionalVerificationDto) {
    if (!dto.requestVerification) {
      throw new BadRequestException('Zaškrtněte „Chci ověřit profesní profil“.');
    }
    if (!dto.publishAfterApproval) {
      throw new BadRequestException('Zaškrtněte „Zveřejnit po schválení administrátorem“.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        name: true,
        email: true,
        bio: true,
        avatar: true,
        brokerOfficeName: true,
        professionalVerificationStatus: true,
        whatsappVerified: true,
        agentProfile: {
          select: { companyName: true, ico: true, bio: true, avatarUrl: true },
        },
        companyProfile: {
          select: { companyName: true, ico: true, description: true, logoUrl: true },
        },
        agencyProfile: {
          select: { agencyName: true, ico: true, logoUrl: true },
        },
        financialAdvisorProfile: {
          select: { ico: true, bio: true, avatarUrl: true },
        },
        investorProfile: { select: { bio: true, avatarUrl: true } },
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (!isProfessionalRole(user.role)) {
      throw new ForbiddenException(
        'Žádost o ověření mohou podat jen profesionální účty (makléř, firma, kancelář, řemeslník, poradce, investor).',
      );
    }

    assertWhatsAppVerified(user, WHATSAPP_VERIFY_PROFESSIONAL_MSG);

    const blockingIssues = collectVerificationBlockingIssues(
      user as VerificationEligibilityInput,
    );
    if (blockingIssues.length > 0) {
      throw new BadRequestException(blockingIssues.join(' '));
    }

    if (user.professionalVerificationStatus === ProfessionalVerificationStatus.APPROVED) {
      throw new ConflictException('Váš profesní profil je již ověřen.');
    }

    const now = new Date();
    const isUpdate = user.professionalVerificationStatus === ProfessionalVerificationStatus.PENDING;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        professionalVerified: false,
        professionalVerificationStatus: ProfessionalVerificationStatus.PENDING,
        publicProfessionalProfile: false,
        isPublicBrokerProfile: false,
        professionalVerificationRequestedAt: now,
        professionalRejectedAt: null,
      },
    });

    await this.syncProfileVerificationStatus(
      userId,
      user.role,
      ProfessionalVerificationStatus.PENDING,
      false,
    );

    return {
      ok: true,
      professionalVerificationStatus: ProfessionalVerificationStatus.PENDING,
      message: isUpdate
        ? 'Žádost o ověření byla aktualizována a čeká na schválení administrátorem.'
        : 'Žádost o ověření byla odeslána a čeká na schválení administrátorem.',
    };
  }

  private extractBio(user: {
    bio: string | null;
    role: UserRole;
    agentProfile: { bio: string } | null;
    companyProfile: { description: string } | null;
    agencyProfile: { description: string } | null;
    financialAdvisorProfile: { bio: string } | null;
    investorProfile: { bio: string } | null;
  }): string {
    const fromProfile =
      user.agentProfile?.bio ??
      user.companyProfile?.description ??
      user.agencyProfile?.description ??
      user.financialAdvisorProfile?.bio ??
      user.investorProfile?.bio ??
      '';
    return (user.bio?.trim() || fromProfile.trim()).slice(0, 2000);
  }

  async adminListPending() {
    const rows = await this.prisma.user.findMany({
      where: { professionalVerificationStatus: ProfessionalVerificationStatus.PENDING },
      orderBy: { professionalVerificationRequestedAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatar: true,
        bio: true,
        professionalVerificationRequestedAt: true,
        agentProfile: { select: { bio: true, avatarUrl: true, companyName: true } },
        companyProfile: { select: { description: true, logoUrl: true, companyName: true } },
        agencyProfile: { select: { description: true, logoUrl: true, agencyName: true } },
        financialAdvisorProfile: { select: { bio: true, avatarUrl: true, brandName: true } },
        investorProfile: { select: { bio: true, avatarUrl: true, investorName: true } },
      },
    });

    return rows.map((u) => ({
      id: u.id,
      userId: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      roleLabel: professionalRoleLabel(u.role),
      bio: this.extractBio(u),
      avatarUrl:
        u.avatar ??
        u.agentProfile?.avatarUrl ??
        u.companyProfile?.logoUrl ??
        u.agencyProfile?.logoUrl ??
        u.financialAdvisorProfile?.avatarUrl ??
        u.investorProfile?.avatarUrl ??
        null,
      companyOrBrand:
        u.agentProfile?.companyName ??
        u.companyProfile?.companyName ??
        u.agencyProfile?.agencyName ??
        u.financialAdvisorProfile?.brandName ??
        u.investorProfile?.investorName ??
        null,
      requestedAt: u.professionalVerificationRequestedAt?.toISOString() ?? null,
    }));
  }

  async adminApprove(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        professionalVerificationStatus: true,
        whatsappVerified: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (user.professionalVerificationStatus !== ProfessionalVerificationStatus.PENDING) {
      throw new BadRequestException('Schválit lze jen žádosti ve stavu PENDING.');
    }
    if (!isProfessionalRole(user.role)) {
      throw new BadRequestException('Uživatel nemá profesionální roli.');
    }
    if (!user.whatsappVerified) {
      throw new BadRequestException(
        'Uživatel nemá ověřené WhatsApp číslo — nejdříve ověřte telefon nebo schvalte ručně v administraci.',
      );
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        professionalVerified: true,
        professionalVerificationStatus: ProfessionalVerificationStatus.APPROVED,
        publicProfessionalProfile: true,
        isPublicBrokerProfile: user.role === UserRole.AGENT,
        professionalVerifiedAt: now,
        professionalRejectedAt: null,
      },
    });

    await this.syncProfileVerificationStatus(
      userId,
      user.role,
      ProfessionalVerificationStatus.APPROVED,
      true,
    );

    return { ok: true, userId };
  }

  async adminReject(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        professionalVerificationStatus: true,
      },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (user.professionalVerificationStatus !== ProfessionalVerificationStatus.PENDING) {
      throw new BadRequestException('Zamítnout lze jen žádosti ve stavu PENDING.');
    }

    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        professionalVerified: false,
        professionalVerificationStatus: ProfessionalVerificationStatus.REJECTED,
        publicProfessionalProfile: false,
        isPublicBrokerProfile: false,
        professionalRejectedAt: now,
      },
    });

    await this.syncProfileVerificationStatus(
      userId,
      user.role,
      ProfessionalVerificationStatus.REJECTED,
      false,
    );

    return { ok: true, userId };
  }

  /** Po odeslání profesní žádosti z legacy formuláře (pokud se ještě používá). */
  async markPendingFromProfileRequest(userId: string, role: UserRole) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        professionalVerified: false,
        professionalVerificationStatus: ProfessionalVerificationStatus.PENDING,
        publicProfessionalProfile: false,
        isPublicBrokerProfile: false,
        professionalVerificationRequestedAt: now,
        professionalRejectedAt: null,
      },
    });
    await this.syncProfileVerificationStatus(
      userId,
      role,
      ProfessionalVerificationStatus.PENDING,
      false,
    );
  }

  /** Voláno z legacy schvalování profilů — sjednocení User polí. */
  async applyApprovedFromLegacy(userId: string, role: UserRole) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        professionalVerified: true,
        professionalVerificationStatus: ProfessionalVerificationStatus.APPROVED,
        publicProfessionalProfile: true,
        isPublicBrokerProfile: role === UserRole.AGENT,
        professionalVerifiedAt: now,
        professionalRejectedAt: null,
      },
    });
    await this.syncProfileVerificationStatus(
      userId,
      role,
      ProfessionalVerificationStatus.APPROVED,
      true,
    );
  }

  async applyRejectedFromLegacy(userId: string, role: UserRole) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        professionalVerified: false,
        professionalVerificationStatus: ProfessionalVerificationStatus.REJECTED,
        publicProfessionalProfile: false,
        isPublicBrokerProfile: false,
        professionalRejectedAt: now,
      },
    });
    await this.syncProfileVerificationStatus(
      userId,
      role,
      ProfessionalVerificationStatus.REJECTED,
      false,
    );
  }
}
