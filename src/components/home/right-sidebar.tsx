type Props = {
  className?: string;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

const AGENTS = [
  {
    name: 'Jana Nováková',
    role: 'Makléř — Praha',
    deals: '47 transakcí',
    initial: 'J',
  },
  {
    name: 'Petr Dvořák',
    role: 'Makléř — Brno',
    deals: '32 transakcí',
    initial: 'P',
  },
  {
    name: 'Market Reality',
    role: 'Tým premium nemovitostí',
    deals: 'Ověřený partner',
    initial: 'M',
  },
];

export function RightSidebar({ className = '' }: Props) {
  return (
    <aside
      className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}
    >
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
          Makléři
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Doporučení pro vás
        </p>
      </div>

      <ul className="space-y-3">
        {AGENTS.map((a) => (
          <li key={a.name}>
            <button
              type="button"
              className="flex w-full items-start gap-3 rounded-2xl border border-zinc-100 bg-zinc-50/80 p-4 text-left shadow-sm transition duration-300 hover:border-zinc-200 hover:bg-white hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6a00] to-[#ff3c00] text-sm font-semibold text-white shadow-[0_4px_16px_-4px_rgba(255,106,0,0.45)]">
                {a.initial}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold tracking-tight text-zinc-900">
                  {a.name}
                </span>
                <span className="mt-1 block text-[13px] leading-snug text-zinc-500">
                  {a.role}
                </span>
                <span className="mt-1.5 block text-[13px] font-semibold text-[#e85d00]">
                  {a.deals}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

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
