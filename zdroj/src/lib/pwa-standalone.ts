/** Běží aplikace jako nainstalovaná PWA (standalone), ne v klasickém prohlížeči. */
export function isPwaStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}
