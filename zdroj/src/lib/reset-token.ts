import { createHash, randomBytes } from 'node:crypto';

export function generateResetPlainToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashResetToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}
