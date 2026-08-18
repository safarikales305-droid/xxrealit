'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ImportJobView } from '@/lib/company-directory-client';
import {
  nestAdminCompanyImportAction,
  nestAdminCompanyImportRetry,
} from '@/lib/company-directory-client';

type Props = {
  token: string;
  job: ImportJobView;
  onRefresh: () => void;
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
  onDetail: () => void;
};

type PendingAction = 'pause' | 'resume' | 'stop' | 'retry' | 'repair' | null;

function isAresTooMany(error?: string | null): boolean {
  if (!error) return false;
  const msg = error.toLowerCase();
  return (
    msg.includes('příliš mnoho') ||
    msg.includes('1000') ||
    msg.includes('1 000') ||
    msg.includes('too_many')
  );
}

export function CompanyImportJobControls({
  token,
  job,
  onRefresh,
  onMessage,
  onError,
  onDetail,
}: Props) {
  const [pending, setPending] = useState<PendingAction>(null);
  const [confirmStop, setConfirmStop] = useState(false);

  async function runAction(
    action: PendingAction,
    fn: () => Promise<void>,
    successMsg: string,
  ) {
    if (!action || pending) return;
    setPending(action);
    try {
      await fn();
      onMessage(successMsg);
      onRefresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Akce selhala');
    } finally {
      setPending(null);
      setConfirmStop(false);
    }
  }

  const status = job.status;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(status === 'RUNNING' || status === 'PENDING') && (
        <>
          <Btn
            disabled={!!pending}
            onClick={() =>
              void runAction('pause', async () => {
                onMessage('Požadavek na pozastavení odeslán…');
                const res = await nestAdminCompanyImportAction(token, job.id, 'pause');
                if (!res) throw new Error('Pozastavení se nezdařilo');
              }, 'Požadavek na pozastavení přijat.')
            }
            label={pending === 'pause' ? 'Pozastavuji…' : '⏸ Pozastavit'}
            pending={pending === 'pause'}
          />
          {!confirmStop ? (
            <Btn
              disabled={!!pending}
              onClick={() => setConfirmStop(true)}
              label="■ Zastavit"
              variant="danger"
            />
          ) : (
            <StopConfirm
              pending={pending === 'stop'}
              onCancel={() => setConfirmStop(false)}
              onConfirm={() =>
                void runAction('stop', async () => {
                  onMessage('Zastavuji import…');
                  const res = await nestAdminCompanyImportAction(token, job.id, 'stop');
                  if (!res) throw new Error('Zastavení se nezdařilo');
                }, 'Požadavek na zastavení přijat.')
              }
            />
          )}
        </>
      )}

      {status === 'PAUSE_REQUESTED' && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
          <Loader2 className="size-3 animate-spin" />
          Pozastavuji…
        </span>
      )}

      {(status === 'PAUSED' || status === 'STOPPED') && (
        <>
          <Btn
            disabled={!!pending}
            onClick={() =>
              void runAction('resume', async () => {
                onMessage('Pokračuji v importu…');
                const res = await nestAdminCompanyImportAction(token, job.id, 'resume');
                if (!res) throw new Error('Pokračování se nezdařilo');
              }, 'Import pokračuje.')
            }
            label={pending === 'resume' ? 'Pokračuji…' : '▶ Pokračovat'}
            pending={pending === 'resume'}
          />
          {!confirmStop ? (
            <Btn
              disabled={!!pending}
              onClick={() => setConfirmStop(true)}
              label="■ Zastavit"
              variant="danger"
            />
          ) : (
            <StopConfirm
              pending={pending === 'stop'}
              onCancel={() => setConfirmStop(false)}
              onConfirm={() =>
                void runAction('stop', async () => {
                  onMessage('Zastavuji import…');
                  const res = await nestAdminCompanyImportAction(token, job.id, 'stop');
                  if (!res) throw new Error('Zastavení se nezdařilo');
                }, 'Požadavek na zastavení přijat.')
              }
            />
          )}
        </>
      )}

      {status === 'CANCEL_REQUESTED' && (
        <span className="inline-flex items-center gap-1 text-xs text-amber-700">
          <Loader2 className="size-3 animate-spin" />
          Zastavuji…
        </span>
      )}

      {status === 'FAILED' && (
        <>
          <span className="text-xs font-medium text-red-700">⚠ Chyba</span>
          {isAresTooMany(job.error) || job.needsResplit ? (
            <Btn
              disabled={!!pending}
              onClick={() =>
                void runAction('repair', async () => {
                  onMessage('Opravuji a pokračuji…');
                  const res = await nestAdminCompanyImportAction(token, job.id, 'resplit');
                  if (!res) throw new Error('Oprava se nezdařila');
                }, 'Import opraven a pokračuje.')
              }
              label={pending === 'repair' ? 'Opravuji…' : '↻ Pokračovat / opravit'}
              pending={pending === 'repair'}
            />
          ) : (
            <Btn
              disabled={!!pending}
              onClick={() =>
                void runAction('retry', async () => {
                  const res = await nestAdminCompanyImportRetry(token, job.id);
                  if (!res.ok) throw new Error(res.error);
                }, 'Import znovu spuštěn.')
              }
              label={pending === 'retry' ? 'Opakuji…' : '↻ Opakovat'}
              pending={pending === 'retry'}
            />
          )}
        </>
      )}

      {status === 'COMPLETED' && (
        <span className="text-xs font-medium text-emerald-700">✓ Dokončeno</span>
      )}

      {(status === 'COMPLETED' || status === 'CANCELLED') && (
        <Btn
          disabled={!!pending}
          onClick={() =>
            void runAction('retry', async () => {
              const res = await nestAdminCompanyImportRetry(token, job.id);
              if (!res.ok) throw new Error(res.error);
            }, 'Nový import spuštěn.')
          }
          label={pending === 'retry' ? 'Spouštím…' : '↻ Opakovat import'}
          pending={pending === 'retry'}
        />
      )}

      <Btn disabled={!!pending} onClick={onDetail} label="Detail" variant="muted" />
    </div>
  );
}

function StopConfirm({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs">
      <span>Opravdu ukončit? Importované firmy zůstanou.</span>
      <Btn
        disabled={pending}
        onClick={onConfirm}
        label={pending ? 'Zastavuji…' : 'Potvrdit zastavení'}
        variant="danger"
        pending={pending}
      />
      <button type="button" className="underline" onClick={onCancel}>
        Zrušit
      </button>
    </div>
  );
}

function Btn({
  label,
  onClick,
  disabled,
  pending,
  variant = 'default',
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pending?: boolean;
  variant?: 'default' | 'danger' | 'muted';
}) {
  const cls =
    variant === 'danger'
      ? 'border-red-300 text-red-800'
      : variant === 'muted'
        ? 'border-zinc-200 text-zinc-700'
        : 'border-zinc-300 text-zinc-800';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium disabled:opacity-50 ${cls}`}
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : null}
      {label}
    </button>
  );
}
