import { AdminShell } from '@/components/admin/AdminShell';
import { AdminLoadingProvider } from '@/components/admin/loading/AdminLoadingProvider';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminLoadingProvider>
      <AdminShell>{children}</AdminShell>
    </AdminLoadingProvider>
  );
}
