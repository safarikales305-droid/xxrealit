'use client';

import Link from 'next/link';

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  id?: string;
  className?: string;
};

export function TermsConsentCheckbox({
  checked,
  onChange,
  error,
  id = 'termsAccepted',
  className = '',
}: Props) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-3 text-sm text-zinc-800"
      >
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
          aria-invalid={Boolean(error)}
        />
        <span>
          Souhlasím s{' '}
          <Link
            href="/obchodni-podminky"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-orange-600 underline hover:text-orange-700"
            onClick={(e) => e.stopPropagation()}
          >
            obchodními podmínkami
          </Link>{' '}
          a pravidly portálu XXrealit.cz
        </span>
      </label>
      {error ? <p className="mt-1.5 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
