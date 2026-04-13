import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
type Props = {
  className?: string;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

export function RightSidebar({ className = '' }: Props) {
  const { isAuthenticated, isLoading } = useAuth();
  return (
    <aside
      className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}
    >
      {!isLoading && isAuthenticated ? (
        <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
          <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">Makléři</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
            Ověřené profesionální profily.
          </p>
          <Link
            href="/makleri"
            className="mt-3 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-xs font-semibold text-white"
          >
            Otevřít sekci Makléři
          </Link>
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-100 bg-zinc-50 p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Tip
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-zinc-600">
          Uložte si oblíbené inzeráty — brzy přidáme upozornění na změny ceny.
        </p>
      </div>
    </aside>
  );
}
