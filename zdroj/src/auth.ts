import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { z } from 'zod';
import { getInternalApiBaseUrl } from '@/lib/server-api';
import { isUserRole, type UserRole } from '@/lib/roles';

const credentialsSchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

const googleEnabled =
  Boolean(process.env.AUTH_GOOGLE_ID?.trim()) &&
  Boolean(process.env.AUTH_GOOGLE_SECRET?.trim());

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'E-mail' },
        password: { label: 'Heslo', type: 'password' },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        const api = getInternalApiBaseUrl();
        const res = await fetch(`${api}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: parsed.data.email,
            password: parsed.data.password,
          }),
        });

        const raw = (await res.json().catch(() => null)) as null | {
          accessToken?: string;
          user?: {
            id: string;
            email: string;
            name: string | null;
            role: string;
            avatar: string | null;
            bio: string | null;
            city: string | null;
          };
        };

        if (!res.ok || !raw?.accessToken || !raw.user) {
          return null;
        }

        if (!isUserRole(raw.user.role)) {
          return null;
        }

        return {
          id: raw.user.id,
          email: raw.user.email,
          name: raw.user.name ?? undefined,
          image: raw.user.avatar ?? undefined,
          role: raw.user.role as UserRole,
          apiAccessToken: raw.accessToken,
          bio: raw.user.bio,
          city: raw.user.city,
        };
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID as string,
            clientSecret: process.env.AUTH_GOOGLE_SECRET as string,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        if (
          'apiAccessToken' in user &&
          typeof user.apiAccessToken === 'string'
        ) {
          token.apiAccessToken = user.apiAccessToken;
        } else if (account?.provider === 'google') {
          token.apiAccessToken = undefined;
        }

        if (
          'role' in user &&
          typeof user.role === 'string' &&
          isUserRole(user.role)
        ) {
          token.role = user.role;
        } else if (account?.provider === 'google') {
          token.role = 'sledujici';
        }

        token.bio =
          'bio' in user && (user.bio === null || typeof user.bio === 'string')
            ? user.bio
            : null;
        token.city =
          'city' in user && (user.city === null || typeof user.city === 'string')
            ? user.city
            : null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.sub ?? '') as string;
        const tr = token.role;
        if (typeof tr === 'string' && isUserRole(tr)) {
          session.user.role = tr;
        }
        session.user.bio =
          token.bio === undefined || token.bio === null
            ? null
            : String(token.bio);
        session.user.city =
          token.city === undefined || token.city === null
            ? null
            : String(token.city);
      }
      if (typeof token.apiAccessToken === 'string') {
        session.apiAccessToken = token.apiAccessToken;
      } else {
        session.apiAccessToken = undefined;
      }
      return session;
    },
  },
});
