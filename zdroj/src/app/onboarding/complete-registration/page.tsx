'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestSendEmailVerification } from '@/lib/nest-client';
import { nestVerifyPhone } from '@/lib/marketing-bonus';

export default function CompleteRegistrationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken, refresh } = useAuth();
  const requirements = user?.registrationRequirements;
  const pending = requirements?.steps.filter((s) => !s.completed) ?? [];
  const pendingCount = requirements?.pendingCount ?? pending.length;

  if (!isLoading && user?.role === 'PROPERTY_SEEKER') {
    router.replace('/?tab=shorts');
    return null;
  }

  if (!isLoading && requirements?.allCompleted) {
    router.replace('/');
    return null;
  }

  async function handleVerifyEmail() {
    if (!apiAccessToken) return;
    const result = await nestSendEmailVerification(apiAccessToken);
    if (result.ok) void refresh();
  }

  async function handleVerifyPhone() {
    if (!apiAccessToken) return;
    const ok = await nestVerifyPhone(apiAccessToken);
    if (ok) void refresh();
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-zinc-900">Dokončení registrace</h1>
        <p className="mt-2 text-sm text-zinc-600">
          {pendingCount === 1
            ? 'K dokončení registrace zbývá splnit 1 krok.'
            : `K dokončení registrace zbývá splnit ${pendingCount} kroků.`}
        </p>

        <ol className="mt-6 space-y-3">
          {(requirements?.steps ?? []).map((step) => (
            <li
              key={step.key}
              className={`rounded-xl border px-4 py-3 ${
                step.completed
                  ? 'border-emerald-200 bg-emerald-50/80'
                  : 'border-zinc-200 bg-zinc-50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-900">{step.label}</span>
                <span
                  className={`text-xs font-semibold ${
                    step.completed ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {step.completed ? 'Hotovo' : 'Zbývá'}
                </span>
              </div>
              {!step.completed ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link
                    href={step.href}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                  >
                    Pokračovat
                  </Link>
                  {step.key === 'EMAIL_VERIFIED' ? (
                    <button
                      type="button"
                      onClick={() => void handleVerifyEmail()}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700"
                    >
                      Odeslat ověřovací e-mail
                    </button>
                  ) : null}
                  {step.key === 'PHONE_VERIFIED' ? (
                    <button
                      type="button"
                      onClick={() => void handleVerifyPhone()}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700"
                    >
                      Potvrdit telefon
                    </button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        {pendingCount === 0 && !isLoading ? (
          <button
            type="button"
            onClick={() => router.push('/')}
            className="mt-6 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white"
          >
            Vstoupit na portál
          </button>
        ) : null}
      </div>
    </main>
  );
}
