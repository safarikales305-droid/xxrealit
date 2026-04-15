import type { ReactNode } from 'react';

export default function InzeratPridatLayout({ children }: { children: ReactNode }) {
  // Listing create flow is for logged-in users across roles; do not gate by private-seller portal.
  return <>{children}</>;
}
