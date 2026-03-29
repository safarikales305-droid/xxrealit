import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/lib/roles';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: DefaultSession['user'] & {
      id: string;
      role: UserRole;
      bio: string | null;
      city: string | null;
    };
    apiAccessToken?: string;
  }

  interface User {
    role?: UserRole;
    apiAccessToken?: string;
    bio?: string | null;
    city?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
    apiAccessToken?: string;
    bio?: string | null;
    city?: string | null;
  }
}
