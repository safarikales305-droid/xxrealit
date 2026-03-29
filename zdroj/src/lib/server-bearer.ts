import { auth } from '@/auth';

export async function getServerAccessToken(): Promise<string | null> {
  const session = await auth();
  return session?.apiAccessToken ?? null;
}

export async function getServerAuthorizationHeader(): Promise<string | undefined> {
  const token = await getServerAccessToken();
  return token ? `Bearer ${token}` : undefined;
}
