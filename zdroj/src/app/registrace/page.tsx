'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-3.5 text-[15px] text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none transition placeholder:text-zinc-400 focus:border-orange-400/80 focus:bg-white focus:ring-2 focus:ring-orange-500/20';

const selectClass =
  'w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-3.5 text-[15px] text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none transition focus:border-orange-400/80 focus:bg-white focus:ring-2 focus:ring-orange-500/20';

type FieldErrors = Partial<
  Record<'name' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'role', string>
>;

type RegisterJson = {
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

function pickFieldErrors(raw: RegisterJson['fieldErrors']): FieldErrors {
  if (!raw) return {};
  const first = (arr: string[] | undefined) => (arr && arr[0] ? arr[0] : undefined);
  return {
    name: first(raw.name),
    email: first(raw.email),
    phone: first(raw.phone),
    password: first(raw.password),
    confirmPassword: first(raw.confirmPassword),
    role: first(raw.role),
  };
}

export default function RegistracePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
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
        body: JSON.stringify({ name, email, phone, password, confirmPassword, role }),
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
          } else if (fe.name) setError(fe.name);
          else if (fe.phone) setError(fe.phone);
          else if (fe.email) setError(fe.email);
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
      setError('Nelze se spojit se serverem. Zkuste to prosím za chvíli.');
    } finally {
      setLoading(false);
    }
  }

  const loginHref = redirect
    ? `/login?redirect=${encodeURIComponent(redirect)}`
    : '/login';

  return (
    <AuthPageShell variant="register">
      <p className="mb-6 text-center text-sm font-medium text-zinc-500">Nový účet</p>
      <p className="mb-6 text-center text-sm leading-relaxed text-zinc-600">
        Heslo alespoň 6 znaků. Vyberte typ účtu, který nejlépe vystihuje vaši roli na trhu.
      </p>

      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
            Jméno
          </label>
          <input
            id="name"
            type="text"
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Jan Novák"
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.name}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="email" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
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
            placeholder="vas@email.cz"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
            Telefon
          </label>
          <input
            id="phone"
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            placeholder="+420123456789"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.phone}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="role" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
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
          <label htmlFor="password" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
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
            placeholder="Nejméně 6 znaků"
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
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
            placeholder="Zopakujte heslo"
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
          {fieldErrors.confirmPassword ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
          ) : null}
        </div>

        {error ? (
          <div
            className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-orange-900/25 transition hover:opacity-[0.97] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? 'Vytvářím účet…' : 'Vytvořit účet'}
        </button>
      </form>

      <p className="mt-8 border-t border-zinc-100 pt-6 text-center text-sm text-zinc-600">
        Už máte účet?{' '}
        <Link href={loginHref} className="font-semibold text-orange-600 hover:text-orange-700 hover:underline">
          Přihlásit se
        </Link>
      </p>
    </AuthPageShell>
  );
}
