import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** JWT volitelný — anonymní požadavky projdou, přihlášený uživatel má req.user. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context).catch(() => true);
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser | null {
    if (err || !user) return null;
    return user;
  }
}
