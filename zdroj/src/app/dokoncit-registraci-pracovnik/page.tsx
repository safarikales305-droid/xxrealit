'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PasswordField } from '@/components/ui/PasswordField';
import { nestCompleteWorkerReferral, nestGetWorkerReferralByToken } from '@/lib/nest-client';

export default function CompleteWorkerReferralPage() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [info, setInfo] = useState<{
    name: string;
    email: string;
    targetRole: string;
    workerName: string;
  } | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    void nestGetWorkerReferralByToken(token).then((data) => {
      if (!data || typeof data !== 'object') {
        setError('Odkaz není platný.');
        return;
      }
      const o = data as Record<string, unknown>;
      setInfo({
        name: String(o.name ?? ''),
        email: String(o.email ?? ''),
        targetRole: String(o.targetRole ?? ''),
        workerName: String(o.workerName ?? ''),
      });
      setName(String(o.name ?? ''));
    });
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Hesla se neshodují.');
      return;
    }
    if (!termsAccepted || !gdprAccepted) {
      setError('Musíte souhlasit s obchodními podmínkami a GDPR.');
      return;
    }
    setLoading(true);
    setError(null);
    const r = await nestCompleteWorkerReferral({ token, password, name: name.trim() });
    setLoading(false);
    if (!r.ok) {
      setError(r.error ?? 'Dokončení selhalo');
      return;
    }
    router.push('/login?registered=1');
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-bold text-zinc-900">Dokončení registrace</h1>
      {info ? (
        <p className="mt-2 text-sm text-zinc-600">
          Pracovník portálu <strong>{info.workerName}</strong> vám založil účet ({info.email}).
          Nastavte heslo a dokončete registraci.
        </p>
      ) : null}
      <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">
          Jméno / firma
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            required
          />
        </label>
        <label className="block text-sm font-semibold" htmlFor="worker-ref-password">
          Heslo
          <PasswordField
            id="worker-ref-password"
            value={password}
            onChange={setPassword}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            minLength={8}
            required
          />
        </label>
        <label className="block text-sm font-semibold" htmlFor="worker-ref-password-confirm">
          Potvrzení hesla
          <PasswordField
            id="worker-ref-password-confirm"
            value={confirm}
            onChange={setConfirm}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            minLength={8}
            required
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-1" />
          <span>
            Souhlasím s{' '}
            <Link href="/obchodni-podminky" target="_blank" className="text-[#e85d00] underline">
              obchodními podmínkami
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={gdprAccepted} onChange={(e) => setGdprAccepted(e.target.checked)} className="mt-1" />
          <span>
            Souhlasím se zpracováním osobních údajů dle{' '}
            <Link href="/privacy" target="_blank" className="text-[#e85d00] underline">
              GDPR
            </Link>
            .
          </span>
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading || !token}
          className="w-full rounded-lg bg-[#e85d00] py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Ukládám…' : 'Dokončit registraci'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="font-semibold text-[#e85d00] hover:underline">
          Přihlásit se
        </Link>
      </p>
    </main>
  );
}
