import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { isObservable, lastValueFrom } from 'rxjs';

/** JWT volitelný — anonymní požadavky projdou, přihlášený uživatel má req.user. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = super.canActivate(context);

      if (result instanceof Promise) {
        await result;
      } else if (isObservable(result)) {
        await lastValueFrom(result);
      }

      return true;
    } catch {
      return true;
    }
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser | null {
    if (err || !user) return null;
    return user;
  }
}
