'use client';

type Props = {
  className?: string;
};

const lightCard =
  'border border-zinc-200/90 bg-white shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08),0_8px_24px_-12px_rgba(0,0,0,0.06)]';

export function SidebarFilters({ className = '' }: Props) {
  return (
    <aside
      className={`flex flex-col gap-6 rounded-2xl p-6 ${lightCard} ${className}`}
    >
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
          Filtry
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">
          Lokalita, cena, typ
        </p>
      </div>

      <div className="space-y-5">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
          Typ nemovitosti
          <select className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-[15px] font-medium text-zinc-900 outline-none transition hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15">
            <option>Vše</option>
            <option>Byt</option>
            <option>Dům</option>
            <option>Pozemek</option>
          </select>
        </label>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Cena (Kč)
          </p>
          <div className="mt-2 flex gap-3">
            <input
              type="number"
              placeholder="Od"
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15"
            />
            <input
              type="number"
              placeholder="Do"
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 hover:border-zinc-300 focus:border-[#ff6a00]/60 focus:ring-2 focus:ring-[#ff6a00]/15"
            />
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
            Lokalita
          </legend>
          {['Praha', 'Brno', 'Ostrava', 'Olomouc'].map((city) => (
            <label
              key={city}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-1 py-1 transition hover:border-zinc-100 hover:bg-zinc-50"
            >
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300 accent-[#ff6a00] focus:ring-2 focus:ring-[#ff6a00]/25"
              />
              <span className="text-[15px] font-medium tracking-tight text-zinc-800">
                {city}
              </span>
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold tracking-[-0.01em] text-white shadow-[0_6px_24px_-6px_rgba(255,106,0,0.45)] transition hover:scale-[1.02] hover:shadow-[0_10px_32px_-6px_rgba(255,90,0,0.5)] active:scale-[0.98]"
        >
          Použít filtry
        </button>
      </div>
    </aside>
  );
}
