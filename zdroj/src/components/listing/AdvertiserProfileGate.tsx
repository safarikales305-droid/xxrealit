'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

type Options = {
  canViewProfile: boolean;
  isAuthenticated: boolean;
};

export function useAdvertiserProfileGate({ canViewProfile, isAuthenticated }: Options) {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);

  const requestProfileNavigation = useCallback(
    (navigate: () => void) => {
      if (canViewProfile) {
        navigate();
        return;
      }
      if (!isAuthenticated) {
        setLoginModalOpen(true);
        return;
      }
      setUnlockModalOpen(true);
    },
    [canViewProfile, isAuthenticated],
  );

  return {
    loginModalOpen,
    setLoginModalOpen,
    unlockModalOpen,
    setUnlockModalOpen,
    requestProfileNavigation,
  };
}

type ModalsProps = {
  gate: ReturnType<typeof useAdvertiserProfileGate>;
  loginHref?: string;
};

export function AdvertiserProfileGateModals({
  gate,
  loginHref = '/login',
}: ModalsProps) {
  return (
    <>
      {gate.loginModalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Přihlášení</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Pro zobrazení profilu inzerenta se prosím přihlaste.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href={loginHref}
                className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
              >
                Přihlásit se
              </Link>
              <button
                type="button"
                onClick={() => gate.setLoginModalOpen(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {gate.unlockModalOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Profil inzerenta</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Profil inzerenta se zobrazí po odemčení kontaktu.
            </p>
            <button
              type="button"
              onClick={() => gate.setUnlockModalOpen(false)}
              className="mt-4 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
            >
              Zavřít
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
