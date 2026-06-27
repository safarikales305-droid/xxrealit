'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import {
  SUPPORT_TICKET_CATEGORIES,
  type SupportOpenOptions,
  type SupportTicketCategory,
} from '@/lib/support-tickets';

type Props = {
  open: boolean;
  onClose: () => void;
  initial?: SupportOpenOptions;
};

const inputClass =
  'w-full rounded-2xl border border-[#EAEAEA] bg-[#FAFAFA] px-4 py-3 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-500 focus:shadow-[0_0_0_4px_rgba(255,106,0,0.15)]';

export function SupportTicketModal({ open, onClose, initial }: Props) {
  const { user } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('TECHNICAL');
  const [message, setMessage] = useState('');
  const [gdprConsent, setGdprConsent] = useState(false);
  const [contactConsent, setContactConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSuccess(false);
    setError(null);
    setSubject(initial?.subject ?? '');
    setCategory(initial?.category ?? 'TECHNICAL');
    if (user) {
      const parts = (user.name ?? '').trim().split(/\s+/);
      setFirstName(parts[0] ?? '');
      setLastName(parts.slice(1).join(' '));
      setEmail(user.email ?? '');
      setPhone(user.phone ?? '');
      setWhatsapp(user.phone ?? '');
    }
  }, [open, initial, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!gdprConsent || !contactConsent) {
      setError('Musíte souhlasit s oběma podmínkami zpracování údajů.');
      return;
    }
    setLoading(true);
    try {
      const base = API_BASE_URL?.endsWith('/api') ? API_BASE_URL : API_BASE_URL ? `${API_BASE_URL}/api` : '/api';
      const res = await fetch(`${base}/support-tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          firstName,
          lastName: lastName || undefined,
          phone,
          whatsapp,
          email,
          subject,
          category,
          message,
          gdprConsent,
          contactConsent,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        setError(typeof msg === 'string' ? msg : 'Odeslání se nezdařilo');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[10080] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Zavřít" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Kontaktovat podporu"
        className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          aria-label="Zavřít"
        >
          ×
        </button>

        {success ? (
          <div className="py-8 text-center">
            <p className="text-2xl font-bold text-zinc-900">Děkujeme.</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-600">
              Vaše zpráva byla úspěšně odeslána.
              <br />
              Podpora vás bude kontaktovat co nejdříve.
            </p>
            {user ? (
              <Link
                href="/profil/podpora"
                className="mt-6 inline-flex rounded-full bg-orange-500 px-5 py-2.5 text-sm font-bold text-white"
                onClick={onClose}
              >
                Moje komunikace s podporou
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <h2 className="pr-10 text-xl font-bold text-zinc-900">Napsat na podporu</h2>
            <p className="mt-1 text-sm text-zinc-500">Vyplňte formulář — odpovíme přes interní systém portálu.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">Jméno *</label>
                  <input className={inputClass} required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">Příjmení</label>
                  <input className={inputClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-semibold">Telefon *</label>
                  <input className={inputClass} required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-semibold">WhatsApp číslo *</label>
                  <input className={inputClass} required type="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">E-mail *</label>
                <input className={inputClass} required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Předmět *</label>
                <input className={inputClass} required value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Kategorie dotazu *</label>
                <select
                  className={inputClass}
                  required
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                >
                  {SUPPORT_TICKET_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Text zprávy *</label>
                <textarea
                  className={`${inputClass} min-h-[7rem] resize-y`}
                  required
                  minLength={10}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input type="checkbox" required checked={gdprConsent} onChange={(e) => setGdprConsent(e.target.checked)} className="mt-1" />
                <span>
                  Souhlasím se zpracováním osobních údajů za účelem vyřízení mého dotazu (
                  <Link href="/privacy" target="_blank" className="font-semibold text-orange-600 underline">
                    GDPR
                  </Link>
                  ).
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm text-zinc-700">
                <input type="checkbox" required checked={contactConsent} onChange={(e) => setContactConsent(e.target.checked)} className="mt-1" />
                <span>
                  Souhlasím se zpracováním telefonního čísla, WhatsApp čísla a e-mailové adresy za účelem komunikace se
                  zákaznickou podporou.
                </span>
              </label>

              {error ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                className="flex h-12 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#ff8a00] to-[#ff5a00] text-sm font-bold text-white disabled:opacity-60"
              >
                {loading ? 'Odesílám…' : 'Odeslat zprávu'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
