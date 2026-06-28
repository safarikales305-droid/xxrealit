'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAdminGetWorkerDetail,
  nestAdminUpdateWorkerProfile,
  nestUploadImageFile,
  type WorkerDetailAdmin,
} from '@/lib/nest-client';

const STATUS_LABEL: Record<string, string> = {
  PENDING_APPROVAL: 'Čeká na schválení',
  APPROVED: 'Schválen',
  REJECTED: 'Zamítnut',
  SUSPENDED: 'Pozastaven',
};

export default function AdminPortalWorkerDetailPage() {
  const params = useParams();
  const userId = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const [worker, setWorker] = useState<WorkerDetailAdmin | null>(null);
  const [phone, setPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('');
  const [maxBonus, setMaxBonus] = useState('');
  const [maxBonusDay, setMaxBonusDay] = useState('');
  const [maxBonusMonth, setMaxBonusMonth] = useState('');
  const [canAssignBonus, setCanAssignBonus] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [whatsappVerified, setWhatsappVerified] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyWorker = useCallback((w: WorkerDetailAdmin) => {
    setWorker(w);
    setPhone(w.phone ?? '');
    setWhatsappPhone(w.whatsappPhone ?? '');
    setCommissionPercent(w.profile.commissionPercent != null ? String(w.profile.commissionPercent) : '');
    setMaxBonus(String(w.profile.maxBonusPerClient ?? 3000));
    setMaxBonusDay(w.profile.maxBonusPerDay != null ? String(w.profile.maxBonusPerDay) : '');
    setMaxBonusMonth(w.profile.maxBonusPerMonth != null ? String(w.profile.maxBonusPerMonth) : '');
    setCanAssignBonus(w.profile.canAssignBonusCredits);
    setIsActive(w.profile.isActive);
    setEmailVerified(w.emailVerified);
    setPhoneVerified(w.phoneVerified);
    setWhatsappVerified(w.whatsappVerified);
    setAdminNotes(w.profile.adminNotes ?? '');
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const r = await nestAdminGetWorkerDetail(apiAccessToken, userId);
    if (r.worker) applyWorker(r.worker);
    else if (r.error) setErr(r.error);
  }, [apiAccessToken, userId, applyWorker]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void load();
  }, [user, isLoading, router, load]);

  async function save() {
    if (!userId) return;
    setBusy(true);
    setErr(null);
    setMsg(null);
    const payload: Record<string, unknown> = {
      phone,
      whatsappPhone,
      emailVerified,
      phoneVerified,
      whatsappVerified,
      canAssignBonusCredits: canAssignBonus,
      isActive,
      adminNotes: adminNotes.trim() || null,
    };
    const pct = commissionPercent.trim();
    if (pct !== '') payload.commissionPercent = Number(pct);
    const bonus = maxBonus.trim();
    if (bonus !== '') payload.maxBonusPerClient = Number(bonus);
    const bonusDay = maxBonusDay.trim();
    payload.maxBonusPerDay = bonusDay !== '' ? Number(bonusDay) : null;
    const bonusMonth = maxBonusMonth.trim();
    payload.maxBonusPerMonth = bonusMonth !== '' ? Number(bonusMonth) : null;

    const r = await nestAdminUpdateWorkerProfile(apiAccessToken, userId, payload);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    if (r.worker) applyWorker(r.worker);
    setMsg('Nastavení pracovníka uloženo.');
  }

  async function onAvatar(file: File) {
    if (!apiAccessToken || !userId) return;
    setBusy(true);
    const r = await nestUploadImageFile(apiAccessToken, file);
    if (r.error || !r.url) {
      setBusy(false);
      setErr(r.error ?? 'Nahrání fotky selhalo');
      return;
    }
    const upd = await nestAdminUpdateWorkerProfile(apiAccessToken, userId, { avatarUrl: r.url });
    setBusy(false);
    if (!upd.ok) {
      setErr(upd.error ?? 'Uložení fotky selhalo');
      return;
    }
    if (upd.worker) applyWorker(upd.worker);
    setMsg('Profilová fotka aktualizována.');
  }

  if (!worker) {
    return (
      <div className="space-y-4">
        <Link href="/admin/pracovnici-portalu" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Pracovníci portálu
        </Link>
        <p className="text-sm text-zinc-600">{err ?? 'Načítám pracovníka…'}</p>
      </div>
    );
  }

  const avatarSrc = worker.avatarUrl ? nestAbsoluteAssetUrl(worker.avatarUrl) : '';

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/pracovnici-portalu" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Pracovníci portálu
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{worker.name}</h1>
        <p className="text-sm text-zinc-600">
          {worker.email} · {STATUS_LABEL[worker.portalWorkerStatus] ?? worker.portalWorkerStatus} ·{' '}
          {worker.clientCount} klientů · Dobití {worker.clientsPaidTopUp.toLocaleString('cs-CZ')} Kč · Provize{' '}
          {worker.estimatedCommission.toLocaleString('cs-CZ')} Kč
        </p>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Profilová fotka</h2>
        <div className="mt-3 flex items-center gap-4">
          {avatarSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarSrc} alt="" className="size-20 rounded-full object-cover" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-full bg-zinc-100 text-2xl text-zinc-400">?</div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onAvatar(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Nahrát fotku
          </button>
        </div>
      </section>

      <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-5 md:grid-cols-2">
        <label className="block text-sm">
          Telefon
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="block text-sm">
          WhatsApp číslo
          <input
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Provize (%)
          <input
            type="number"
            min={0}
            max={100}
            value={commissionPercent}
            onChange={(e) => setCommissionPercent(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Max. bonusové kredity / klient (Kč)
          <input
            type="number"
            min={0}
            value={maxBonus}
            onChange={(e) => setMaxBonus(e.target.value)}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Max. bonusové kredity / den (Kč)
          <input
            type="number"
            min={0}
            value={maxBonusDay}
            onChange={(e) => setMaxBonusDay(e.target.value)}
            placeholder="bez limitu"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Max. bonusové kredity / měsíc (Kč)
          <input
            type="number"
            min={0}
            value={maxBonusMonth}
            onChange={(e) => setMaxBonusMonth(e.target.value)}
            placeholder="bez limitu"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Ruční potvrzení</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={emailVerified} onChange={(e) => setEmailVerified(e.target.checked)} />
            E-mail potvrzen
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={phoneVerified} onChange={(e) => setPhoneVerified(e.target.checked)} />
            Telefon potvrzen
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={whatsappVerified}
              onChange={(e) => setWhatsappVerified(e.target.checked)}
            />
            WhatsApp potvrzen
          </label>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Stav účtu</h2>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={canAssignBonus} onChange={(e) => setCanAssignBonus(e.target.checked)} />
            Povolit přidělování bonusových kreditů
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Aktivní pracovník
          </label>
        </div>
        <label className="mt-4 block text-sm">
          Poznámka admina
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-lg bg-[#e85d00] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#d45500] disabled:opacity-50"
        >
          Uložit
        </button>
        <Link
          href="/admin/provize-pracovniku"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold"
        >
          Provize pracovníků
        </Link>
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}
    </div>
  );
}
