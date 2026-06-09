'use client';

import { useEffect, useState } from 'react';

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  unlockPrice?: number;
  onClose: () => void;
  onSubmit: (payload: { name: string; email: string; phone: string }) => void;
};

export function ContactLeadModal({
  open,
  busy = false,
  error,
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
  unlockPrice = 0,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState(defaultPhone);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setEmail(defaultEmail);
    setPhone(defaultPhone);
    setLocalError(null);
  }, [open, defaultName, defaultEmail, defaultPhone]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPhone = phone.trim();
    if (trimmedName.length < 2) {
      setLocalError('Vyplňte jméno.');
      return;
    }
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setLocalError('Vyplňte platný e-mail.');
      return;
    }
    const digits = trimmedPhone.replace(/\D/g, '');
    if (digits.length < 9) {
      setLocalError('Vyplňte platné telefonní číslo.');
      return;
    }
    setLocalError(null);
    onSubmit({ name: trimmedName, email: trimmedEmail, phone: trimmedPhone });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <h2 className="text-lg font-bold text-zinc-900">Zadejte své kontaktní údaje</h2>
        {unlockPrice > 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            Odemčení kontaktu: <strong>{unlockPrice.toLocaleString('cs-CZ')} Kč</strong> kreditu
          </p>
        ) : (
          <p className="mt-2 text-sm text-zinc-600">Kontakt je zdarma po vyplnění údajů.</p>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-800">Jméno</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5"
              autoComplete="name"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-800">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5"
              autoComplete="email"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-800">Telefon</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5"
              autoComplete="tel"
              required
            />
          </label>

          {localError || error ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              {localError || error}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 pt-2 sm:flex-row">
            <button
              type="submit"
              disabled={busy}
              className="flex flex-1 items-center justify-center rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? 'Odesílám…' : 'Odeslat a zobrazit kontakt'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-full border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700"
            >
              Zrušit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
