import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyAuthJwt } from '@/lib/auth-token';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-cookie';
import { prisma } from '@/lib/db';
import { LogoutButton } from '@/components/dashboard/logout-button';

export default async function PanelPage() {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    redirect('/login?callbackUrl=/panel');
  }
  const payload = verifyAuthJwt(token);
  if (!payload) {
    redirect('/login?callbackUrl=/panel');
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { email: true, name: true, role: true },
  });

  if (!user) {
    redirect('/login?callbackUrl=/panel');
  }

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-12 text-zinc-900">
      <Link
        href="/"
        className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
      >
        ← Domů
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Panel</h1>
      <p className="mt-2 text-[15px] text-zinc-600">
        Přihlášen jako{' '}
        <span className="font-medium text-zinc-800">{user.email}</span>
        {user.name ? (
          <>
            {' '}
            ({user.name})
          </>
        ) : null}
      </p>
      <p className="mt-1 text-sm text-zinc-500">Role: {user.role}</p>
      <div className="mt-8">
        <LogoutButton />
      </div>
    </div>
  );
}
