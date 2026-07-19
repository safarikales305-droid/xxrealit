export function loginRedirectPath(returnPath: string): string {
  const path = returnPath.trim() || '/';
  return `/login?redirect=${encodeURIComponent(path)}`;
}
