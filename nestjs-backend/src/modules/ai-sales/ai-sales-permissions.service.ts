import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AI_SALES_PERMISSIONS, type AiSalesPermission } from './ai-sales.constants';

@Injectable()
export class AiSalesPermissionsService {
  private readonly adminPermissions = new Set<AiSalesPermission>(AI_SALES_PERMISSIONS);

  assertPermission(role: UserRole | string | undefined, permission: AiSalesPermission) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException(`Chybí oprávnění: ${permission}`);
    }
    if (!this.adminPermissions.has(permission)) {
      throw new ForbiddenException(`Neplatné oprávnění: ${permission}`);
    }
  }

  canViewPersonalData(role: UserRole | string | undefined): boolean {
    return role === 'ADMIN';
  }

  maskEmail(email: string | null | undefined, role: UserRole | string | undefined): string | null {
    if (!email) return null;
    if (this.canViewPersonalData(role)) return email;
    const [local, domain] = email.split('@');
    if (!domain) return '***';
    return `${local.slice(0, 2)}***@${domain}`;
  }
}
