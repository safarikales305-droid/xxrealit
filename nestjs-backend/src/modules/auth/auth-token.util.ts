import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from './types/jwt-payload';

/** Extract `sub` from `Authorization: Bearer …` without throwing auth errors. */
export function parseBearerUserId(
  jwt: JwtService,
  authHeader?: string,
): string | undefined {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) {
    return undefined;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return undefined;
  try {
    const payload = jwt.verify<JwtPayload>(token);
    return payload.sub;
  } catch {
    return undefined;
  }
}
