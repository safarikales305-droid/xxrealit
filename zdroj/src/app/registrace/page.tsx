'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { FacebookAuthButton } from '@/components/auth/FacebookAuthButton';
import { PortalIntroLink } from '@/components/auth/PortalIntroLink';
import { TermsConsentCheckbox } from '@/components/auth/TermsConsentCheckbox';
import { PasswordField } from '@/components/ui/PasswordField';
import {
  REGISTRATION_ACCOUNT_TYPES,
  type RegistrationAccountType,
} from '@/lib/registration-account-types';

import {
  authDividerClass,
  authFormSpacing,
  authInputClass,
  authLabelClass,
  authPrimaryBtnClass,
  authSecondaryBtnClass,
  authSelectClass,
  authTextareaClass,
} from '@/components/auth/auth-form-styles';

type FieldErrors = Partial<
  Record<
    | 'name'
    | 'firstName'
    | 'lastName'
    | 'email'
    | 'phone'
    | 'password'
    | 'confirmPassword'
    | 'role'
    | 'city'
    | 'bio'
    | 'portalWorkerCooperationConsent'
    | 'termsAccepted',
    string
  >
>;

type RegisterJson = {
  error?: string;
  code?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  portalWorker?: boolean;
};

function pickFieldErrors(raw: RegisterJson['fieldErrors']): FieldErrors {
  if (!raw) return {};
  const first = (arr: string[] | undefined) => (arr && arr[0] ? arr[0] : undefined);
  return {
    name: first(raw.name),
    firstName: first(raw.firstName),
    lastName: first(raw.lastName),
    email: first(raw.email),
    phone: first(raw.phone),
    password: first(raw.password),
    confirmPassword: first(raw.confirmPassword),
    role: first(raw.role),
    city: first(raw.city),
    bio: first(raw.bio),
    portalWorkerCooperationConsent: first(raw.portalWorkerCooperationConsent),
    termsAccepted: first(raw.termsAccepted),
  };
}

export default function RegistracePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect');
  const referralCode = searchParams.get('ref');
  const [name, setName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<RegistrationAccountType>('USER');
  const [wantsPortalWorker, setWantsPortalWorker] = useState(false);
  const [cooperationConsent, setCooperationConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
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
          name: wantsPortalWorker ? undefined : name,
          firstName: wantsPortalWorker ? firstName : undefined,
          lastName: wantsPortalWorker ? lastName : undefined,
          email,
          phone,
          city: wantsPortalWorker ? city : undefined,
          bio: wantsPortalWorker ? bio : undefined,
          password,
          confirmPassword,
          role: wantsPortalWorker ? 'USER' : role,
          referralCode: referralCode?.trim() || undefined,
          wantsPortalWorker,
          portalWorkerCooperationConsent: wantsPortalWorker ? cooperationConsent : undefined,
          termsAccepted,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as RegisterJson;

      if (!res.ok) {
        const fe = pickFieldErrors(data.fieldErrors);
        setFieldErrors(fe);

        if (res.status === 409 && data.code === 'EMAIL_EXISTS') {
          setError(data.error ?? 'Tento e-mail je již registrovaný.');
          return;
        }

        if (res.status === 400) {
          setError(data.error ?? 'Zkontrolujte údaje ve formuláři');
          return;
        }

        setError(data.error ?? 'Registrace selhala');
        return;
      }

      if (data.portalWorker || wantsPortalWorker) {
        router.push('/registrace/pracovnik-dekujeme');
        router.refresh();
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
      <form onSubmit={onSubmit} className={authFormSpacing}>
        <PortalIntroLink />
        <Link href="/registrace/hledam-nemovitost" className={authSecondaryBtnClass}>
          Hledám nemovitost
        </Link>

        <div className={authDividerClass}>
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
            <span className="bg-white px-3 text-zinc-500">nebo registrace inzerenta</span>
          </div>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-4 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={wantsPortalWorker}
            onChange={(e) => setWantsPortalWorker(e.target.checked)}
            className="mt-0.5"
          />
          <span>Chci pracovat pro XXrealit.cz</span>
        </label>

        {wantsPortalWorker ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="firstName" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
                  Jméno
                </label>
                <input
                  id="firstName"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={authInputClass}
                  aria-invalid={Boolean(fieldErrors.firstName)}
                />
                {fieldErrors.firstName ? (
                  <p className="mt-1.5 text-sm text-red-600">{fieldErrors.firstName}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="lastName" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
                  Příjmení
                </label>
                <input
                  id="lastName"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className={authInputClass}
                  aria-invalid={Boolean(fieldErrors.lastName)}
                />
                {fieldErrors.lastName ? (
                  <p className="mt-1.5 text-sm text-red-600">{fieldErrors.lastName}</p>
                ) : null}
              </div>
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="name" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
              Jméno
            </label>
            <input
              id="name"
              type="text"
              required
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={authInputClass}
              placeholder="Jan Novák"
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name ? (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.name}</p>
            ) : null}
          </div>
        )}

        <div>
          <label htmlFor="email" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputClass}
            placeholder="vas@email.cz"
            aria-invalid={Boolean(fieldErrors.email)}
          />
          {fieldErrors.email ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="phone" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
            Telefon
          </label>
          <input
            id="phone"
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={authInputClass}
            placeholder="+420123456789"
            aria-invalid={Boolean(fieldErrors.phone)}
          />
          {fieldErrors.phone ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.phone}</p>
          ) : null}
        </div>

        {wantsPortalWorker ? (
          <>
            <div>
              <label htmlFor="city" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
                Město
              </label>
              <input
                id="city"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={authInputClass}
                aria-invalid={Boolean(fieldErrors.city)}
              />
              {fieldErrors.city ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.city}</p>
              ) : null}
            </div>
            <div>
              <label htmlFor="bio" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
                Krátké představení
              </label>
              <textarea
                id="bio"
                required
                minLength={20}
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className={authTextareaClass}
                placeholder="Napište, proč chcete spolupracovat s XXrealit.cz…"
                aria-invalid={Boolean(fieldErrors.bio)}
              />
              {fieldErrors.bio ? (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors.bio}</p>
              ) : null}
            </div>
            <label className="flex items-start gap-3 rounded-2xl border border-[#EAEAEA] bg-[#FAFAFA] px-4 py-4 text-sm text-zinc-800">
              <input
                type="checkbox"
                required
                checked={cooperationConsent}
                onChange={(e) => setCooperationConsent(e.target.checked)}
                className="mt-0.5"
              />
              <span>Souhlasím se spoluprací s XXrealit.cz jako pracovník portálu</span>
            </label>
            {fieldErrors.portalWorkerCooperationConsent ? (
              <p className="text-sm text-red-600">{fieldErrors.portalWorkerCooperationConsent}</p>
            ) : null}
          </>
        ) : (
          <div>
            <label htmlFor="role" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
              Typ účtu
            </label>
            <select
              id="role"
              name="role"
              value={role}
              onChange={(e) => setRole(e.target.value as RegistrationAccountType)}
              className={authSelectClass}
              aria-invalid={Boolean(fieldErrors.role)}
            >
              {REGISTRATION_ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {fieldErrors.role ? (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors.role}</p>
            ) : null}
          </div>
        )}

        <div>
          <label htmlFor="password" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
            Heslo
          </label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={setPassword}
            className={authInputClass}
            placeholder="Nejméně 6 znaků"
            aria-invalid={Boolean(fieldErrors.password)}
          />
          {fieldErrors.password ? (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors.password}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="confirm" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
            Potvrzení hesla
          </label>
          <PasswordField
            id="confirm"
            autoComplete="new-password"
            required
            minLength={6}
            value={confirmPassword}
            onChange={setConfirmPassword}
            className={authInputClass}
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

        <TermsConsentCheckbox
          checked={termsAccepted}
          onChange={setTermsAccepted}
          error={fieldErrors.termsAccepted}
        />

        <button
          type="submit"
          disabled={loading || !termsAccepted}
          className={authPrimaryBtnClass}
        >
          {loading ? 'Odesílám…' : wantsPortalWorker ? 'Odeslat žádost' : 'Registrovat'}
        </button>
      </form>

      {!wantsPortalWorker ? (
        <>
          <div className={authDividerClass}>
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
              <span className="bg-white px-3 text-zinc-500">nebo</span>
            </div>
          </div>

          <FacebookAuthButton
            label="Registrovat přes Facebook"
            event="facebook_register_click"
            disabled={!termsAccepted}
          />
        </>
      ) : null}

      <p className="mt-8 border-t border-zinc-100 pt-6 text-center text-sm text-zinc-600">
        Už máte účet?{' '}
        <Link href={loginHref} className="font-semibold text-orange-600 hover:text-orange-700 hover:underline">
          Přihlásit se
        </Link>
      </p>
    </AuthPageShell>
  );
}
