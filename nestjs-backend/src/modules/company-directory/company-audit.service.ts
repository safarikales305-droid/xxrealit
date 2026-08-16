import { Injectable } from '@nestjs/common';
import { CompanyAuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class CompanyAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(input: {
    companyId?: string | null;
    action: CompanyAuditAction;
    message: string;
    meta?: Prisma.InputJsonValue;
    actorUserId?: string | null;
  }) {
    return this.prisma.companyAuditLog.create({
      data: {
        companyId: input.companyId ?? null,
        action: input.action,
        message: input.message,
        meta: input.meta,
        actorUserId: input.actorUserId ?? null,
      },
    });
  }
}
