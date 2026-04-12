import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 text-sm font-medium text-white/60">
          Načítání…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
