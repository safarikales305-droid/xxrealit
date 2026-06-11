/** Sdílené tokeny pro mobilní app-style panely (menu, filtr). */
export const appMobilePanel = {
  overlay:
    'fixed inset-0 z-[100] bg-black/60 backdrop-blur-[10px] motion-safe:animate-[app-overlay-in_0.22s_ease-out]',
  sheet:
    'border border-white/10 bg-zinc-950/96 text-zinc-100 shadow-[0_28px_90px_rgba(0,0,0,0.55)] backdrop-blur-2xl',
  sheetRoundedTop: 'rounded-t-[28px]',
  sheetRoundedPanel: 'rounded-[22px]',
  title: 'text-[17px] font-bold tracking-tight text-white',
  subtitle: 'text-[13px] leading-relaxed text-zinc-400',
  sectionLabel:
    'text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500',
  menuItem:
    'flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold text-zinc-100 transition active:scale-[0.98] hover:bg-white/[0.07] focus-visible:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40',
  menuItemDanger:
    'flex w-full items-center gap-3.5 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold text-red-300 transition active:scale-[0.98] hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/35',
  chip:
    'inline-flex min-h-[40px] items-center justify-center rounded-full border px-4 py-2 text-[14px] font-semibold transition active:scale-[0.97]',
  chipIdle: 'border-white/15 bg-white/[0.06] text-zinc-200 hover:border-white/25 hover:bg-white/10',
  chipActive:
    'border-orange-400/50 bg-gradient-to-r from-[#ff6a00]/25 to-[#ff3c00]/20 text-white shadow-[0_0_20px_-4px_rgba(255,106,0,0.45)]',
  input:
    'w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-[15px] font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20',
  select:
    'w-full rounded-2xl border border-white/12 bg-white/[0.06] px-4 py-3 text-[15px] font-medium text-white outline-none transition focus:border-orange-500/50 focus:ring-2 focus:ring-orange-500/20',
  primaryBtn:
    'w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-bold text-white shadow-[0_8px_28px_-6px_rgba(255,106,0,0.5)] transition hover:brightness-110 active:scale-[0.98]',
  secondaryBtn:
    'w-full rounded-full border border-white/18 bg-white/[0.04] py-3 text-[14px] font-semibold text-zinc-200 transition hover:bg-white/[0.08] active:scale-[0.98]',
  closeBtn:
    'flex size-10 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] text-zinc-300 transition hover:bg-white/10 hover:text-white active:scale-95',
} as const;
