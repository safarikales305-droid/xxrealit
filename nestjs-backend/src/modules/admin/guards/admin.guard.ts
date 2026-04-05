import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { UserRole } from '@prisma/client';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { role?: UserRole } }>();
    const role = req.user?.role;
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Vyžadována role administrátora');
    }
    return true;
  }
}
