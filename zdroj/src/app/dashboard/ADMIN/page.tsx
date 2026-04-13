import Link from 'next/link';
import { RoleDashboard } from '@/components/dashboard/role-dashboard';

export default function AdminRoleDashboardPage() {
  return (
    <div className="space-y-4">
      <RoleDashboard
        title="Administrace"
        description="Plná správa webu je v samostatném admin rozhraní."
      />
      <Link
        href="/admin"
        className="inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
      >
        Otevřít administraci
      </Link>
    </div>
  );
}
