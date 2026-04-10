import { Suspense, type ReactNode } from 'react';

export default function RegistraceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-zinc-600">
          Načítání…
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
