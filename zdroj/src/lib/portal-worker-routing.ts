export type PortalWorkerStatus =
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'SUSPENDED'
  | null
  | undefined;

export function portalWorkerHomePath(status: PortalWorkerStatus): string {
  if (status === 'SUSPENDED') return '/pracovnik/pozastaven';
  if (status === 'PENDING_APPROVAL' || status === 'REJECTED') {
    return '/pracovnik/cekam-na-schvaleni';
  }
  return '/pracovnik';
}

/** Cesty, které schválený pracovník portálu nesmí navštívit. */
const BLOCKED_PREFIXES_FOR_APPROVED_WORKER = [
  '/admin',
  '/dashboard',
  '/profil',
  '/moje-inzeraty',
  '/inzerat',
  '/create',
  '/kredity',
  '/marketing',
] as const;

export function isPathBlockedForPortalWorker(pathname: string): boolean {
  const p = pathname.split('?')[0] ?? pathname;
  if (p.startsWith('/pracovnik')) return false;
  if (p === '/login' || p === '/registrace') return false;
  return BLOCKED_PREFIXES_FOR_APPROVED_WORKER.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

export function shouldRedirectPortalWorker(
  role: string | undefined | null,
  status: PortalWorkerStatus,
  pathname: string,
): string | null {
  if (role !== 'PORTAL_WORKER') return null;
  const p = pathname.split('?')[0] ?? pathname;

  if (status === 'SUSPENDED') {
    return p.startsWith('/pracovnik/pozastaven') ? null : '/pracovnik/pozastaven';
  }
  if (status === 'PENDING_APPROVAL' || status === 'REJECTED') {
    return p.startsWith('/pracovnik/cekam-na-schvaleni') ? null : '/pracovnik/cekam-na-schvaleni';
  }
  if (status === 'APPROVED') {
    if (p.startsWith('/pracovnik/cekam-na-schvaleni') || p.startsWith('/pracovnik/pozastaven')) {
      return '/pracovnik';
    }
    if (isPathBlockedForPortalWorker(p)) return '/pracovnik';
  }
  return null;
}
