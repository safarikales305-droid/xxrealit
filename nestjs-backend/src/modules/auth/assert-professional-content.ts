import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { AuthUser } from './decorators/current-user.decorator';

const PROFESSIONAL_CONTENT_ROLES = new Set<UserRole>([
  UserRole.AGENT,
  UserRole.COMPANY,
  UserRole.AGENCY,
  UserRole.ADMIN,
]);

export function assertUserCanCreateProfessionalContent(user: AuthUser): void {
  const role = user.role as UserRole;
  if (!PROFESSIONAL_CONTENT_ROLES.has(role)) {
    throw new ForbiddenException(
      'Příspěvky a profesionální inzerci mohou přidávat pouze makléři, stavební firmy a realitní kanceláře.',
    );
  }
}
