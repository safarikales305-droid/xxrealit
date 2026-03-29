import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from '@/lib/server-api';

export async function getServerAccessToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ACCESS_TOKEN_COOKIE)?.value ?? null;
}

export async function getServerAuthorizationHeader(): Promise<string | undefined> {
  const token = await getServerAccessToken();
  return token ? `Bearer ${token}` : undefined;
}
