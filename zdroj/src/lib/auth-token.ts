import jwt from 'jsonwebtoken';
import { getJwtSecretString } from '@/lib/server-api';

export type AuthJwtPayload = {
  sub: string;
  email: string;
  role: string;
};

export function signAuthJwt(payload: AuthJwtPayload): string {
  return jwt.sign(payload, getJwtSecretString(), {
    algorithm: 'HS256',
    expiresIn: '7d',
  });
}

export function verifyAuthJwt(token: string): AuthJwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecretString()) as jwt.JwtPayload &
      Partial<AuthJwtPayload>;
    const sub = decoded.sub;
    const email = decoded.email;
    const role = decoded.role;
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof role !== 'string') {
      return null;
    }
    return { sub, email, role };
  } catch {
    return null;
  }
}
