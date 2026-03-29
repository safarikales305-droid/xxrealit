'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ROLE_LABELS,
  USER_ROLES,
  dashboardPathForRole,
  isUserRole,
} from '@/lib/roles';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

const selectClass = `${inputClass} appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(USER_ROLES[2]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          role,
        }),
      });
      const data = (await res.json()) as {
        message?: string | string[] | object;
        issues?: unknown;
        user?: { role?: string };
      };
      if (!res.ok) {
        const msg = Array.isArray(data.message)
          ? data.message.join(', ')
          : typeof data.message === 'object' && data.message !== null
            ? JSON.stringify(data.message)
            : data.message;
        setError(
          typeof msg === 'string' && msg
            ? msg
            : 'Registrace se nezdařila — zkontrolujte údaje',
        );
        return;
      }

      const signResult = await signIn('credentials', {
        redirect: false,
        email: email.trim(),
        password,
      });

      if (signResult?.error) {
        router.push('/login?registered=1');
        router.refresh();
        return;
      }

      const newRole = data.user?.role;
      if (newRole && isUserRole(newRole)) {
        router.push(dashboardPathForRole(newRole));
      } else {
        router.push('/dashboard');
      }
      router.refresh();
    } catch {
      setError('Nelze se spojit se serverem');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-4 py-16 text-zinc-900">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
        >
          ← Zpět
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Registrace</h1>
        <p className="mt-2 text-[15px] text-zinc-600">
          Zvolte roli — podle ní uvidíte příslušný panel po přihlášení.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
              Jméno (nepovinné)
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Heslo (min. 8 znaků)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="role" className="mb-1.5 block text-sm font-medium">
              Role na platformě
            </label>
            <select
              id="role"
              name="role"
              required
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className={selectClass}
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {error ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
          >
            {loading ? 'Registruji…' : 'Vytvořit účet'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Už máte účet?{' '}
          <Link href="/login" className="font-semibold text-[#e85d00] hover:underline">
            Přihlásit se
          </Link>
        </p>
      </div>
    </div>
  );
}
