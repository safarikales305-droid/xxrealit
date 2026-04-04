'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toPublicApiUrl } from '@/lib/public-api';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';
const selectClass = `${inputClass} appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-10`;

const ROLE_OPTIONS = [
  { value: 'makler', label: 'Makléř' },
  { value: 'kancelar', label: 'Realitní kancelář' },
  { value: 'remeslnik', label: 'Řemeslník' },
  { value: 'firma', label: 'Stavební firma' },
  { value: 'uzivatel', label: 'Soukromý inzerent' },
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>(ROLE_OPTIONS[4].value);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const roleOption = ROLE_OPTIONS.find((o) => o.value === role);
      const roleLabel = roleOption?.label ?? role;

      const registerUrl = toPublicApiUrl('/register');

      const res = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          name: name.trim() || undefined,
          role: roleLabel,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        [key: string]: unknown;
      };

      console.log('REGISTER RESPONSE:', data);

      if (!res.ok) {
        setError(
          (typeof data.error === 'string' && data.error) ||
            JSON.stringify(data),
        );
        return;
      }

      router.push('/login?registered=1');
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
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Registrace
        </h1>
        <p className="mt-2 text-[15px] text-zinc-600">
          Zvolte roli — podle ní uvidíte příslušný panel po přihlášení.
        </p>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mt-8 space-y-4"
        >
          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-medium"
            >
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
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium"
            >
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
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium"
            >
              Heslo (min. 6 znaků)
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="mb-1.5 block text-sm font-medium"
            >
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
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
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
          <Link
            href="/login"
            className="font-semibold text-[#e85d00] hover:underline"
          >
            Přihlásit se
          </Link>
        </p>
      </div>
    </div>
  );
}
