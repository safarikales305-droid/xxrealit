import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgentVerificationStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { anyPublicListingWhere } from '../properties/property-listing-scope';
import {
  serializeProperty,
  type PropertyViewerAccess,
} from '../properties/properties.serializer';
import type { SubmitAgentRequestDto } from './dto/submit-agent-request.dto';
import type { SubmitCompanyRequestDto } from './dto/submit-company-request.dto';
import type { SubmitAgencyRequestDto } from './dto/submit-agency-request.dto';
import type { SubmitFinancialAdvisorRequestDto } from './dto/submit-financial-advisor-request.dto';
import type { SubmitInvestorRequestDto } from './dto/submit-investor-request.dto';

function listingInclude(viewerId?: string) {
  return viewerId
    ? {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
        likes: {
          where: { userId: viewerId },
          select: { id: true },
          take: 1,
        },
      }
    : {
        media: { orderBy: { sortOrder: 'asc' as const } },
        _count: { select: { likes: true } },
        user: { select: { id: true, city: true } },
      };
}

function normalizeWebsite(raw: string | undefined): string {
  const t = (raw ?? '').trim().slice(0, 500);
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

type ProfessionalProfileType =
  | 'agent'
  | 'company'
  | 'agency'
  | 'financial_advisor'
  | 'investor';

function parseVerificationStatus(
  raw: string | undefined,
): AgentVerificationStatus | undefined {
  if (!raw?.trim()) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'pending' || v === 'verified' || v === 'rejected') {
    return v as AgentVerificationStatus;
  }
  throw new BadRequestException('Neplatný filtr statusu (pending | verified | rejected).');
}

@Injectable()
export class AgentProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rezervováno pro budoucí SMS ověření telefonu (Twilio apod.).
   * Zatím telefon neověřujeme — `phoneVerified` zůstává false, dokud sem nepřidáte integraci.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async verifyPhoneWithSmsStub(_userId: string, _code: string): Promise<never> {
    throw new BadRequestException('SMS ověření telefonu zatím není aktivní.');
  }

  private async viewerAccess(
    viewerId?: string,
  ): Promise<PropertyViewerAccess | undefined> {
    if (!viewerId) return undefined;
    const u = await this.prisma.user.findUnique({
      where: { id: viewerId },
      select: { role: true, isPremiumBroker: true },
    });
    if (!u) return undefined;
    return {
      role: u.role,
      isPremiumBroker: Boolean(u.isPremiumBroker),
      isAdmin: u.role === UserRole.ADMIN,
    };
  }

  async getMine(userId: string) {
    const row = await this.prisma.agentProfile.findUnique({
      where: { userId },
    });
    return row
      ? {
          id: row.id,
          fullName: row.fullName,
          companyName: row.companyName,
          phone: row.phone,
          phoneVerified: row.phoneVerified,
          website: row.website,
          ico: row.ico,
          city: row.city,
          bio: row.bio,
          avatarUrl: row.avatarUrl,
          verificationStatus: row.verificationStatus,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null;
  }

  async submitRequest(userId: string, dto: SubmitAgentRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('Uživatel nenalezen');
    }
    const canRequestUpgrade =
      user.role === UserRole.USER ||
      user.role === UserRole.PRIVATE_SELLER ||
      user.role === UserRole.DEVELOPER;
    if (!canRequestUpgrade) {
      throw new ForbiddenException(
        'Žádost o roli makléře mohou podat jen účty typu uživatel / soukromý prodejce / developer (ne makléř ani administrátor).',
      );
    }

    const icoRaw = (dto.ico ?? '').trim();
    if (icoRaw && !/^\d{8}$/.test(icoRaw)) {
      throw new BadRequestException('IČO musí mít přesně 8 číslic nebo zůstat prázdné.');
    }

    const existing = await this.prisma.agentProfile.findUnique({
      where: { userId },
    });
    if (existing?.verificationStatus === AgentVerificationStatus.verified) {
      throw new ConflictException('Žádost již byla schválena.');
    }

    const website = normalizeWebsite(dto.website);
    if (website) {
      try {
        // eslint-disable-next-line no-new
        new URL(website);
      } catch {
        throw new BadRequestException('Neplatná adresa webové stránky.');
      }
    }

    const common = {
      fullName: dto.fullName.trim().slice(0, 200),
      companyName: dto.companyName.trim().slice(0, 200),
      phone: dto.phone.trim().slice(0, 40),
      website,
      ico: icoRaw,
      city: dto.city.trim().slice(0, 120),
      bio: dto.bio.trim().slice(0, 2000),
      avatarUrl:
        dto.avatarUrl && dto.avatarUrl.trim().length > 0
          ? dto.avatarUrl.trim().slice(0, 2000)
          : null,
      verificationStatus: AgentVerificationStatus.pending,
      phoneVerified: false,
    };

    const saved = existing
      ? await this.prisma.agentProfile.update({
          where: { userId },
          data: common,
        })
      : await this.prisma.agentProfile.create({
          data: { userId, ...common },
        });

    return {
      id: saved.id,
      verificationStatus: saved.verificationStatus,
      phoneVerified: saved.phoneVerified,
      message: 'Žádost byla uložena a čeká na schválení administrátorem.',
    };
  }

  async getPublicVerifiedByUserId(userId: string, viewerId?: string) {
    const broker = await this.prisma.user.findFirst({
      where: {
        id: userId,
        role: UserRole.AGENT,
        agentProfile: { verificationStatus: AgentVerificationStatus.verified },
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        agentProfile: {
          select: {
            fullName: true,
            companyName: true,
            phone: true,
            phoneVerified: true,
            website: true,
            city: true,
            bio: true,
            avatarUrl: true,
            verificationStatus: true,
          },
        },
      },
    });
    if (!broker?.agentProfile) {
      throw new NotFoundException('Veřejný profil makléře nebyl nalezen.');
    }
    const ap = broker.agentProfile;
    const displayName =
      ap.companyName?.trim() ||
      ap.fullName?.trim() ||
      broker.name?.trim() ||
      'Makléř';

    const access = await this.viewerAccess(viewerId);
    const listingRows = await this.prisma.property.findMany({
      where: { userId: broker.id, ...anyPublicListingWhere },
      orderBy: { createdAt: 'desc' },
      include: listingInclude(viewerId),
    });
    const listings = listingRows.map((r) =>
      serializeProperty(
        {
          ...r,
          likes: 'likes' in r && Array.isArray(r.likes) ? r.likes : [],
          _count: r._count,
          user: r.user,
        },
        viewerId,
        access,
      ),
    );

    return {
      userId: broker.id,
      displayName,
      personName: ap.fullName,
      companyName: ap.companyName,
      avatarUrl: ap.avatarUrl?.trim() || broker.avatar,
      bio: ap.bio,
      city: ap.city,
      phone: ap.phone,
      website: ap.website,
      phoneVerified: ap.phoneVerified,
      verificationStatus: ap.verificationStatus,
      listings,
    };
  }

  async adminList(statusRaw?: string) {
    const status = statusRaw?.trim()
      ? parseVerificationStatus(statusRaw)
      : AgentVerificationStatus.pending;
    const rows = await this.prisma.agentProfile.findMany({
      where: { verificationStatus: status },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      verificationStatus: r.verificationStatus,
      fullName: r.fullName,
      companyName: r.companyName,
      phone: r.phone,
      phoneVerified: r.phoneVerified,
      website: r.website,
      ico: r.ico,
      city: r.city,
      bio: r.bio.length > 600 ? `${r.bio.slice(0, 600)}…` : r.bio,
      avatarUrl: r.avatarUrl,
      createdAt: r.createdAt.toISOString(),
      user: r.user,
    }));
  }

  async adminGetById(id: string) {
    const r = await this.prisma.agentProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            avatar: true,
          },
        },
      },
    });
    if (!r) {
      throw new NotFoundException('Žádost nenalezena');
    }
    return {
      id: r.id,
      userId: r.userId,
      verificationStatus: r.verificationStatus,
      fullName: r.fullName,
      companyName: r.companyName,
      phone: r.phone,
      phoneVerified: r.phoneVerified,
      website: r.website,
      ico: r.ico,
      city: r.city,
      bio: r.bio,
      avatarUrl: r.avatarUrl,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      user: r.user
        ? {
            ...r.user,
            createdAt: r.user.createdAt.toISOString(),
          }
        : null,
    };
  }

  async adminApprove(profileId: string) {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { id: true, role: true, avatar: true } } },
    });
    if (!profile) {
      throw new NotFoundException('Žádost nenalezena');
    }
    if (profile.verificationStatus !== AgentVerificationStatus.pending) {
      throw new BadRequestException('Schválit lze jen žádosti ve stavu „čeká na schválení“.');
    }
    const canApproveUpgrade =
      profile.user.role === UserRole.USER ||
      profile.user.role === UserRole.PRIVATE_SELLER ||
      profile.user.role === UserRole.DEVELOPER;
    if (!canApproveUpgrade) {
      throw new BadRequestException(
        'Schválit lze jen žádosti uživatelů, kteří ještě nemají roli makléře ani administrátora.',
      );
    }

    const avatar =
      profile.avatarUrl?.trim() || profile.user.avatar?.trim() || null;

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: profile.userId },
        data: {
          role: UserRole.AGENT,
          name: profile.fullName.trim().slice(0, 200),
          city: profile.city.trim().slice(0, 120),
          bio: profile.bio.trim().slice(0, 5000),
          avatar,
          brokerOfficeName: profile.companyName.trim().slice(0, 200),
          brokerWeb: profile.website.trim().slice(0, 500),
          brokerPhonePublic: profile.phone.trim().slice(0, 40),
        },
      }),
      this.prisma.agentProfile.update({
        where: { id: profile.id },
        data: { verificationStatus: AgentVerificationStatus.verified },
      }),
    ]);

    return { ok: true, userId: profile.userId };
  }

  async adminReject(profileId: string) {
    const profile = await this.prisma.agentProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Žádost nenalezena');
    }
    if (profile.verificationStatus !== AgentVerificationStatus.pending) {
      throw new BadRequestException('Zamítnout lze jen žádosti ve stavu „čeká na schválení“.');
    }
    await this.prisma.agentProfile.update({
      where: { id: profileId },
      data: { verificationStatus: AgentVerificationStatus.rejected },
    });
    return { ok: true, userId: profile.userId };
  }

  async submitCompanyRequest(userId: string, dto: SubmitCompanyRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Administrátor nemůže podat žádost o profesionální profil.');
    }
    const icoRaw = (dto.ico ?? '').trim();
    if (icoRaw && !/^\d{8}$/.test(icoRaw)) {
      throw new BadRequestException('IČO musí mít přesně 8 číslic nebo zůstat prázdné.');
    }
    const existing = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (existing?.verificationStatus === AgentVerificationStatus.verified) {
      throw new ConflictException('Žádost již byla schválena.');
    }
    const common = {
      companyName: dto.companyName.trim().slice(0, 200),
      contactFullName: dto.contactFullName.trim().slice(0, 200),
      phone: dto.phone.trim().slice(0, 40),
      email: dto.email.trim().toLowerCase().slice(0, 200),
      website: normalizeWebsite(dto.website),
      ico: icoRaw,
      city: dto.city.trim().slice(0, 120),
      description: dto.description.trim().slice(0, 2000),
      services: dto.services.trim().slice(0, 2000),
      logoUrl: dto.logoUrl?.trim() || null,
      verificationStatus: AgentVerificationStatus.pending,
    };
    const saved = existing
      ? await this.prisma.companyProfile.update({ where: { userId }, data: common })
      : await this.prisma.companyProfile.create({ data: { userId, ...common } });
    return {
      id: saved.id,
      verificationStatus: saved.verificationStatus,
      message: 'Žádost firmy byla uložena a čeká na schválení administrátorem.',
    };
  }

  async submitAgencyRequest(userId: string, dto: SubmitAgencyRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Administrátor nemůže podat žádost o profesionální profil.');
    }
    const icoRaw = (dto.ico ?? '').trim();
    if (icoRaw && !/^\d{8}$/.test(icoRaw)) {
      throw new BadRequestException('IČO musí mít přesně 8 číslic nebo zůstat prázdné.');
    }
    const existing = await this.prisma.agencyProfile.findUnique({ where: { userId } });
    if (existing?.verificationStatus === AgentVerificationStatus.verified) {
      throw new ConflictException('Žádost již byla schválena.');
    }
    const common = {
      agencyName: dto.agencyName.trim().slice(0, 200),
      contactFullName: dto.contactFullName.trim().slice(0, 200),
      phone: dto.phone.trim().slice(0, 40),
      email: dto.email.trim().toLowerCase().slice(0, 200),
      website: normalizeWebsite(dto.website),
      ico: icoRaw,
      city: dto.city.trim().slice(0, 120),
      description: dto.description.trim().slice(0, 2000),
      agentCount: dto.agentCount ?? null,
      branchCities: (dto.branchCities ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 30),
      logoUrl: dto.logoUrl?.trim() || null,
      verificationStatus: AgentVerificationStatus.pending,
    };
    const saved = existing
      ? await this.prisma.agencyProfile.update({ where: { userId }, data: common })
      : await this.prisma.agencyProfile.create({ data: { userId, ...common } });
    return {
      id: saved.id,
      verificationStatus: saved.verificationStatus,
      message: 'Žádost realitní kanceláře byla uložena a čeká na schválení administrátorem.',
    };
  }

  async submitFinancialAdvisorRequest(userId: string, dto: SubmitFinancialAdvisorRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Administrátor nemůže podat žádost o profesionální profil.');
    }
    const icoRaw = (dto.ico ?? '').trim();
    if (icoRaw && !/^\d{8}$/.test(icoRaw)) {
      throw new BadRequestException('IČO musí mít přesně 8 číslic nebo zůstat prázdné.');
    }
    const existing = await this.prisma.financialAdvisorProfile.findUnique({ where: { userId } });
    if (existing?.verificationStatus === AgentVerificationStatus.verified) {
      throw new ConflictException('Žádost již byla schválena.');
    }
    const common = {
      fullName: dto.fullName.trim().slice(0, 200),
      brandName: (dto.brandName ?? '').trim().slice(0, 200),
      phone: dto.phone.trim().slice(0, 40),
      email: dto.email.trim().toLowerCase().slice(0, 200),
      website: normalizeWebsite(dto.website),
      ico: icoRaw,
      city: dto.city.trim().slice(0, 120),
      bio: dto.bio.trim().slice(0, 2000),
      specializations: (dto.specializations ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 30),
      avatarUrl: dto.avatarUrl?.trim() || null,
      logoUrl: dto.logoUrl?.trim() || null,
      verificationStatus: AgentVerificationStatus.pending,
    };
    const saved = existing
      ? await this.prisma.financialAdvisorProfile.update({ where: { userId }, data: common })
      : await this.prisma.financialAdvisorProfile.create({ data: { userId, ...common } });
    return {
      id: saved.id,
      verificationStatus: saved.verificationStatus,
      message: 'Žádost finančního poradce byla uložena a čeká na schválení administrátorem.',
    };
  }

  async submitInvestorRequest(userId: string, dto: SubmitInvestorRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('Uživatel nenalezen');
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Administrátor nemůže podat žádost o profesionální profil.');
    }
    const existing = await this.prisma.investorProfile.findUnique({ where: { userId } });
    if (existing?.verificationStatus === AgentVerificationStatus.verified) {
      throw new ConflictException('Žádost již byla schválena.');
    }
    const common = {
      fullName: dto.fullName.trim().slice(0, 200),
      investorName: (dto.investorName ?? '').trim().slice(0, 200),
      investorType: dto.investorType.trim().slice(0, 120),
      phone: dto.phone.trim().slice(0, 40),
      email: dto.email.trim().toLowerCase().slice(0, 200),
      website: normalizeWebsite(dto.website),
      city: dto.city.trim().slice(0, 120),
      bio: dto.bio.trim().slice(0, 2000),
      investmentFocus: (dto.investmentFocus ?? [])
        .map((x) => String(x).trim())
        .filter(Boolean)
        .slice(0, 30),
      avatarUrl: dto.avatarUrl?.trim() || null,
      logoUrl: dto.logoUrl?.trim() || null,
      verificationStatus: AgentVerificationStatus.pending,
    };
    const saved = existing
      ? await this.prisma.investorProfile.update({ where: { userId }, data: common })
      : await this.prisma.investorProfile.create({ data: { userId, ...common } });
    return {
      id: saved.id,
      verificationStatus: saved.verificationStatus,
      message: 'Žádost investora byla uložena a čeká na schválení administrátorem.',
    };
  }

  async adminListProfessional(type: ProfessionalProfileType, statusRaw?: string) {
    const status = statusRaw?.trim()
      ? parseVerificationStatus(statusRaw)
      : AgentVerificationStatus.pending;
    if (type === 'agent') return this.adminList(status);
    if (type === 'company') {
      return this.prisma.companyProfile.findMany({
        where: { verificationStatus: status },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      });
    }
    if (type === 'financial_advisor') {
      return this.prisma.financialAdvisorProfile.findMany({
        where: { verificationStatus: status },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      });
    }
    if (type === 'investor') {
      return this.prisma.investorProfile.findMany({
        where: { verificationStatus: status },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { id: true, email: true, name: true, role: true } } },
      });
    }
    return this.prisma.agencyProfile.findMany({
      where: { verificationStatus: status },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
  }

  async adminApproveProfessional(type: ProfessionalProfileType, profileId: string) {
    if (type === 'agent') return this.adminApprove(profileId);
    if (type === 'company') {
      const profile = await this.prisma.companyProfile.findUnique({
        where: { id: profileId },
        include: { user: { select: { id: true } } },
      });
      if (!profile) throw new NotFoundException('Žádost nenalezena');
      await this.prisma.$transaction([
        this.prisma.companyProfile.update({
          where: { id: profileId },
          data: { verificationStatus: AgentVerificationStatus.verified },
        }),
        this.prisma.user.update({
          where: { id: profile.userId },
          data: { role: UserRole.COMPANY, name: profile.contactFullName, city: profile.city, bio: profile.description, avatar: profile.logoUrl ?? undefined },
        }),
      ]);
      return { ok: true, userId: profile.userId };
    }
    if (type === 'financial_advisor') {
      const profile = await this.prisma.financialAdvisorProfile.findUnique({
        where: { id: profileId },
        include: { user: { select: { id: true } } },
      });
      if (!profile) throw new NotFoundException('Žádost nenalezena');
      await this.prisma.$transaction([
        this.prisma.financialAdvisorProfile.update({
          where: { id: profileId },
          data: { verificationStatus: AgentVerificationStatus.verified },
        }),
        this.prisma.user.update({
          where: { id: profile.userId },
          data: {
            role: UserRole.FINANCIAL_ADVISOR,
            name: profile.fullName,
            city: profile.city,
            bio: profile.bio,
            avatar: profile.avatarUrl ?? profile.logoUrl ?? undefined,
          },
        }),
      ]);
      return { ok: true, userId: profile.userId };
    }
    if (type === 'investor') {
      const profile = await this.prisma.investorProfile.findUnique({
        where: { id: profileId },
        include: { user: { select: { id: true } } },
      });
      if (!profile) throw new NotFoundException('Žádost nenalezena');
      await this.prisma.$transaction([
        this.prisma.investorProfile.update({
          where: { id: profileId },
          data: { verificationStatus: AgentVerificationStatus.verified },
        }),
        this.prisma.user.update({
          where: { id: profile.userId },
          data: {
            role: UserRole.INVESTOR,
            name: profile.fullName,
            city: profile.city,
            bio: profile.bio,
            avatar: profile.avatarUrl ?? profile.logoUrl ?? undefined,
          },
        }),
      ]);
      return { ok: true, userId: profile.userId };
    }
    const profile = await this.prisma.agencyProfile.findUnique({
      where: { id: profileId },
      include: { user: { select: { id: true } } },
    });
    if (!profile) throw new NotFoundException('Žádost nenalezena');
    await this.prisma.$transaction([
      this.prisma.agencyProfile.update({
        where: { id: profileId },
        data: { verificationStatus: AgentVerificationStatus.verified },
      }),
      this.prisma.user.update({
        where: { id: profile.userId },
        data: { role: UserRole.AGENCY, name: profile.contactFullName, city: profile.city, bio: profile.description, avatar: profile.logoUrl ?? undefined },
      }),
    ]);
    return { ok: true, userId: profile.userId };
  }

  async adminRejectProfessional(type: ProfessionalProfileType, profileId: string) {
    if (type === 'agent') return this.adminReject(profileId);
    if (type === 'company') {
      await this.prisma.companyProfile.update({
        where: { id: profileId },
        data: { verificationStatus: AgentVerificationStatus.rejected },
      });
      return { ok: true };
    }
    if (type === 'financial_advisor') {
      await this.prisma.financialAdvisorProfile.update({
        where: { id: profileId },
        data: { verificationStatus: AgentVerificationStatus.rejected },
      });
      return { ok: true };
    }
    if (type === 'investor') {
      await this.prisma.investorProfile.update({
        where: { id: profileId },
        data: { verificationStatus: AgentVerificationStatus.rejected },
      });
      return { ok: true };
    }
    await this.prisma.agencyProfile.update({
      where: { id: profileId },
      data: { verificationStatus: AgentVerificationStatus.rejected },
    });
    return { ok: true };
  }
}
