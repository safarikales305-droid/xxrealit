'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { PasswordField } from '@/components/ui/PasswordField';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3.5 py-2.5 text-sm text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none transition placeholder:text-zinc-400 focus:border-orange-400/80 focus:bg-white focus:ring-2 focus:ring-orange-500/20 sm:px-4 sm:py-3.5 sm:text-[15px]';

type FieldErrors = Partial<
  Record<'name' | 'email' | 'phone' | 'password' | 'confirmPassword' | 'marketingConsent', string>
>;

export default function HledamNemovitostPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
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
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          confirmPassword,
          wantsPropertySeeker: true,
          marketingConsentWhatsApp: marketingConsent,
          marketingConsentEmail: marketingConsent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        fieldErrors?: Record<string, string[] | undefined>;
        propertySeeker?: boolean;
      };

      if (!res.ok) {
        const fe: FieldErrors = {};
        const raw = data.fieldErrors;
        if (raw) {
          const first = (arr: string[] | undefined) => (arr?.[0] ? arr[0] : undefined);
          fe.name = first(raw.name);
          fe.email = first(raw.email);
          fe.phone = first(raw.phone);
          fe.password = first(raw.password);
          fe.confirmPassword = first(raw.confirmPassword);
          fe.marketingConsent =
            first(raw.marketingConsentWhatsApp) ?? first(raw.marketingConsentEmail);
        }
        setFieldErrors(fe);
        setError(data.error ?? 'Registrace selhala');
        return;
      }

      router.push('/registrace/overeni-whatsapp');
      router.refresh();
    } catch {
      setError('Nelze se spojit se serverem. Zkuste to prosím za chvíli.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthPageShell variant="register">
      <p className="mb-2 text-center text-sm font-medium text-zinc-500 sm:mb-4">Hledám nemovitost</p>
      <p className="mb-4 text-center text-sm leading-relaxed text-zinc-600">
        Vytvoříte účet jen pro prohlížení portálu — Shorts, klasické inzeráty a příspěvky. Po
        registraci ověříte WhatsApp a sdílíte portál 5 přátelům.
      </p>

      <form onSubmit={onSubmit} className="space-y-3 sm:space-y-4">
        <div>
          <label htmlFor="name" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
            Jméno
          </label>
          <input
            id="name"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.name)}
          />
          {fieldErrors.name ? <p className="mt-1.5 text-sm text-red-600">{fieldErrors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="email" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
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
          {fieldErrors.email ? <p className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p> : null}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
            Telefon (WhatsApp)
          </label>
          <input
            id="phone"
            type="tel"
            required
            placeholder="+420123456789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone ? <p className="mt-1.5 text-sm text-red-600">{fieldErrors.phone}</p> : null}
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
            Heslo
          </label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={setPassword}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
            Potvrzení hesla
          </label>
          <PasswordField
            id="confirm"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={setConfirmPassword}
            className={inputClass}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
          />
          {fieldErrors.confirmPassword ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.confirmPassword}</p>
          ) : null}
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm text-zinc-800">
          <input
            type="checkbox"
            required
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Souhlasím se zasíláním nabídek, novinek a marketingových zpráv z XXrealit.cz přes
            WhatsApp a e-mail.
          </span>
        </label>
        {fieldErrors.marketingConsent ? (
          <p className="text-sm text-red-600">{fieldErrors.marketingConsent}</p>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" role="alert">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/25 transition hover:opacity-[0.97] disabled:opacity-55 sm:py-3.5"
        >
          {loading ? 'Odesílám…' : 'Registrovat jako hledač nemovitosti'}
        </button>
      </form>

      <p className="mt-4 border-t border-zinc-100 pt-4 text-center text-xs text-zinc-600 sm:text-sm">
        <Link href="/registrace" className="font-semibold text-orange-600 hover:underline">
          Jiný typ účtu
        </Link>
        {' · '}
        <Link href="/login" className="font-semibold text-orange-600 hover:underline">
          Přihlásit se
        </Link>
      </p>
    </AuthPageShell>
  );
}
