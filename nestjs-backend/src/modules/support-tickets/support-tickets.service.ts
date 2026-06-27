import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SupportMessageAuthorType,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  AdminUpdateSupportTicketDto,
  CreateSupportMessageDto,
  CreateSupportTicketDto,
} from './dto/support-tickets.dto';

type RequestMeta = { ip?: string; userAgent?: string };

@Injectable()
export class SupportTicketsService {
  constructor(private readonly prisma: PrismaService) {}

  private async nextPublicId(): Promise<string> {
    const year = new Date().getFullYear();
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const count = await this.prisma.supportTicket.count({
      where: { createdAt: { gte: start } },
    });
    return `SP-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  private serializeMessage(row: {
    id: string;
    authorType: SupportMessageAuthorType;
    authorUserId: string | null;
    body: string;
    isInternalNote: boolean;
    createdAt: Date;
    authorUser?: { id: string; name: string; email: string; role: string } | null;
  }) {
    return {
      id: row.id,
      authorType: row.authorType,
      authorUserId: row.authorUserId,
      body: row.body,
      isInternalNote: row.isInternalNote,
      createdAt: row.createdAt.toISOString(),
      authorName: row.authorUser?.name ?? null,
      authorEmail: row.authorUser?.email ?? null,
      authorRole: row.authorUser?.role ?? null,
    };
  }

  private serializeTicket(
    row: Prisma.SupportTicketGetPayload<{
      include: {
        user: { select: { id: true; name: true; email: true; role: true } };
        assignedTo: { select: { id: true; name: true; email: true } };
        messages: {
          include: { authorUser: { select: { id: true; name: true; email: true; role: true } } };
        };
      };
    }>,
    includeInternalNotes = false,
  ) {
    const messages = row.messages
      .filter((m) => includeInternalNotes || !m.isInternalNote)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((m) => this.serializeMessage(m));

    return {
      id: row.id,
      publicId: row.publicId,
      userId: row.userId,
      firstName: row.firstName,
      lastName: row.lastName,
      phone: row.phone,
      whatsapp: row.whatsapp,
      email: row.email,
      subject: row.subject,
      category: row.category,
      status: row.status,
      assignedToId: row.assignedToId,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      lastMessageAt: row.lastMessageAt.toISOString(),
      isRegistered: Boolean(row.userId),
      user: row.user
        ? { id: row.user.id, name: row.user.name, email: row.user.email, role: row.user.role }
        : null,
      assignedTo: row.assignedTo
        ? { id: row.assignedTo.id, name: row.assignedTo.name, email: row.assignedTo.email }
        : null,
      messages,
    };
  }

  private ticketInclude() {
    return {
      user: { select: { id: true, name: true, email: true, role: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      messages: {
        include: {
          authorUser: { select: { id: true, name: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'asc' as const },
      },
    };
  }

  async linkTicketsByEmail(userId: string, email: string) {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return { linked: 0 };
    const result = await this.prisma.supportTicket.updateMany({
      where: { email: normalized, userId: null },
      data: { userId },
    });
    return { linked: result.count };
  }

  async createTicket(
    dto: CreateSupportTicketDto,
    userId: string | null,
    meta?: RequestMeta,
  ) {
    if (!dto.gdprConsent || !dto.contactConsent) {
      throw new BadRequestException('Souhlasy jsou povinné');
    }

    const email = dto.email.trim().toLowerCase();
    const now = new Date();
    const publicId = await this.nextPublicId();

    const ticket = await this.prisma.supportTicket.create({
      data: {
        publicId,
        userId: userId ?? undefined,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName?.trim() || null,
        phone: dto.phone.trim(),
        whatsapp: dto.whatsapp.trim(),
        email,
        subject: dto.subject.trim(),
        category: dto.category,
        status: SupportTicketStatus.NEW,
        ipAddress: meta?.ip ?? null,
        userAgent: meta?.userAgent ?? null,
        gdprConsentAt: now,
        contactConsentAt: now,
        lastMessageAt: now,
        messages: {
          create: {
            authorType: SupportMessageAuthorType.CUSTOMER,
            authorUserId: userId ?? undefined,
            body: dto.message.trim(),
          },
        },
      },
      include: this.ticketInclude(),
    });

    if (!userId) {
      const existing = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { userId: existing.id },
        });
        ticket.userId = existing.id;
      }
    }

    return this.serializeTicket(ticket, false);
  }

  async listMyTickets(userId: string) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { userId },
      include: this.ticketInclude(),
      orderBy: { lastMessageAt: 'desc' },
    });
    return rows.map((r) => this.serializeTicket(r, false));
  }

  async getMyTicket(userId: string, ticketId: string) {
    const row = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      include: this.ticketInclude(),
    });
    if (!row) throw new NotFoundException('Ticket nenalezen');
    return this.serializeTicket(row, false);
  }

  async addCustomerMessage(userId: string, ticketId: string, dto: CreateSupportMessageDto) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
    });
    if (!ticket) throw new NotFoundException('Ticket nenalezen');
    if (ticket.status === SupportTicketStatus.CLOSED) {
      throw new BadRequestException('Ticket je uzavřen');
    }

    const now = new Date();
    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: SupportMessageAuthorType.CUSTOMER,
        authorUserId: userId,
        body: dto.body.trim(),
      },
    });
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: now,
        status:
          ticket.status === SupportTicketStatus.RESOLVED
            ? SupportTicketStatus.WAITING_REPLY
            : ticket.status,
      },
    });
    return this.getMyTicket(userId, ticketId);
  }

  async adminStats() {
    const newCount = await this.prisma.supportTicket.count({
      where: { status: SupportTicketStatus.NEW },
    });
    const waitingReply = await this.prisma.supportTicket.count({
      where: { status: SupportTicketStatus.WAITING_REPLY },
    });
    return { newCount, waitingReply, totalOpen: newCount + waitingReply };
  }

  async adminList(query: {
    status?: string;
    category?: string;
    assignedToId?: string;
    q?: string;
    from?: string;
    to?: string;
  }) {
    const where: Prisma.SupportTicketWhereInput = {};

    if (query.status && Object.values(SupportTicketStatus).includes(query.status as SupportTicketStatus)) {
      where.status = query.status as SupportTicketStatus;
    }
    if (
      query.category &&
      Object.values(SupportTicketCategory).includes(query.category as SupportTicketCategory)
    ) {
      where.category = query.category as SupportTicketCategory;
    }
    if (query.assignedToId) {
      where.assignedToId = query.assignedToId === 'unassigned' ? null : query.assignedToId;
    }
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(query.from);
      if (query.to) where.createdAt.lte = new Date(query.to);
    }
    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { publicId: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { whatsapp: { contains: q } },
        { subject: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.supportTicket.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    });

    return rows.map((r) => ({
      id: r.id,
      publicId: r.publicId,
      createdAt: r.createdAt.toISOString(),
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      whatsapp: r.whatsapp,
      email: r.email,
      category: r.category,
      subject: r.subject,
      status: r.status,
      assignedTo: r.assignedTo,
      userId: r.userId,
      isRegistered: Boolean(r.userId),
    }));
  }

  async adminGet(ticketId: string) {
    const row = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: this.ticketInclude(),
    });
    if (!row) throw new NotFoundException('Ticket nenalezen');
    return this.serializeTicket(row, true);
  }

  async adminUpdate(ticketId: string, dto: AdminUpdateSupportTicketDto) {
    const data: Prisma.SupportTicketUpdateInput = {};
    if (dto.status) {
      if (!Object.values(SupportTicketStatus).includes(dto.status as SupportTicketStatus)) {
        throw new BadRequestException('Neplatný stav');
      }
      data.status = dto.status as SupportTicketStatus;
    }
    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId) {
        data.assignedTo = { connect: { id: dto.assignedToId } };
      } else {
        data.assignedTo = { disconnect: true };
      }
    }
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data });
    return this.adminGet(ticketId);
  }

  async adminReply(
    staffUserId: string,
    ticketId: string,
    dto: CreateSupportMessageDto & { isInternalNote?: boolean },
  ) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket nenalezen');

    const now = new Date();
    await this.prisma.supportTicketMessage.create({
      data: {
        ticketId,
        authorType: SupportMessageAuthorType.STAFF,
        authorUserId: staffUserId,
        body: dto.body.trim(),
        isInternalNote: dto.isInternalNote === true,
      },
    });

    const nextStatus =
      dto.isInternalNote === true
        ? ticket.status
        : SupportTicketStatus.WAITING_CUSTOMER;

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastMessageAt: now,
        status: nextStatus,
        ...(ticket.assignedToId
          ? {}
          : { assignedTo: { connect: { id: staffUserId } } }),
      },
    });

    return this.adminGet(ticketId);
  }

  async assertTicketAccess(userId: string, ticketId: string, role: string) {
    if (role === 'ADMIN' || role === 'PORTAL_WORKER') return;
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
      select: { id: true },
    });
    if (!ticket) throw new ForbiddenException('Přístup odepřen');
  }
}
