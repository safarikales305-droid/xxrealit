import { createHash } from 'node:crypto';

export function hashClientIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 48);
}

export function createPublicShareId(): string {
  return createHash('sha256')
    .update(`${Date.now()}:${Math.random()}:${createHash('sha256').update('viz').digest('hex')}`)
    .digest('base64url')
    .slice(0, 22);
}
