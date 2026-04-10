'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

const selectClass =
  'w-full rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-sm outline-none transition focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

type FieldErrors = Partial<Record<'email' | 'password' | 'confirmPassword' | 'role', string>>;

type RegisterJson = {
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function pickFieldErrors(raw: RegisterJson['fieldErrors']): FieldErrors {
  if (!raw) return {};
  const first = (arr: string[] | undefined) => (arr && arr[0] ? arr[0] : undefined);
  return {
    email: first(raw.email),
    password: first(raw.password),
    confirmPassword: first(raw.confirmPassword),
    role: first(raw.role),
  };
}

export default function RegistracePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'PRIVATE_SELLER' | 'AGENT' | 'DEVELOPER'>('PRIVATE_SELLER');
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword, role }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterJson;

      if (!res.ok) {
        const fe = pickFieldErrors(data.fieldErrors);
        setFieldErrors(fe);

        if (res.status === 409 && data.code === 'EMAIL_EXISTS') {
          setError(data.error ?? 'Tento e-mail je již registrován');
          return;
        }

        if (res.status === 400) {
          if (fe.confirmPassword) setError('Hesla se neshodují');
          else if (fe.password) {
            setError(
              fe.password.includes('6')
                ? 'Slabé heslo — použijte alespoň 6 znaků'
                : fe.password,
            );
          } else if (fe.email) setError(fe.email);
          else if (fe.role) setError(fe.role);
          else setError(data.error ?? 'Zkontrolujte údaje ve formuláři');
          return;
        }

        setError(data.error ?? 'Registrace selhala');
        return;
      }

      const qs = new URLSearchParams();
      qs.set('registered', '1');
      if (redirect) qs.set('redirect', redirect);
      router.push(`/login?${qs.toString()}`);
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
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]">
          ← Domů
        </Link>

        <div className="mt-8 rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-xl shadow-zinc-200/50">
          <h1 className="text-2xl font-semibold tracking-tight">Registrace</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
            Vytvořte si účet. Heslo musí mít alespoň 6 znaků. Vyberte typ účtu.
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-zinc-800">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="role" className="mb-1.5 block text-sm font-medium text-zinc-800">
                Typ účtu
              </label>
              <select
                id="role"
                name="role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'PRIVATE_SELLER' | 'AGENT' | 'DEVELOPER')
                }
                className={selectClass}
                aria-invalid={Boolean(fieldErrors.role)}
              >
                <option value="PRIVATE_SELLER">Soukromý prodejce</option>
                <option value="AGENT">Realitní makléř</option>
                <option value="DEVELOPER">Developer</option>
              </select>
              {fieldErrors.role ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.role}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-zinc-800">
                Heslo
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(fieldErrors.password)}
              />
              {fieldErrors.password ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-zinc-800">
                Potvrzení hesla
              </label>
              <input
                id="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                aria-invalid={Boolean(fieldErrors.confirmPassword)}
              />
              {fieldErrors.confirmPassword ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
              ) : null}
            </div>

            {error ? (
              <p className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
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
        </div>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Už máte účet?{' '}
          <Link
            href={
              redirect
                ? `/login?redirect=${encodeURIComponent(redirect)}`
                : '/login'
            }
            className="font-semibold text-[#e85d00] hover:underline"
          >
            Přihlásit se
          </Link>
        </p>
      </div>
    </div>
  );
}
