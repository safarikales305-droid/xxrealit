import type { UserRole } from '@prisma/client';

export type JwtPayload = {
  sub: string;
  role: UserRole;
  email: string;
};
