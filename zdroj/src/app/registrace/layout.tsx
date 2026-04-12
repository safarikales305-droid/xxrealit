import { Suspense, type ReactNode } from 'react';

export default function RegistraceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-sm font-medium text-white/60">
          Načítání…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
