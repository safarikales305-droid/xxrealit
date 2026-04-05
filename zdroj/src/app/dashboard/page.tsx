import { Building2, ListPlus, Search } from 'lucide-react';
import { DashboardNavCard } from '@/components/rental/DashboardNavCard';
import { PrivateSellerGate } from '@/components/rental/PrivateSellerGate';

export default function DashboardHubPage() {
  return (
    <PrivateSellerGate>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-zinc-600">
          Soukromý inzerent — vyberte, co chcete udělat dál.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <DashboardNavCard
            href="/inzerat/pridat"
            title="Podat inzerát"
            description="Vytvořte nový inzerát na prodej nebo pronájem nemovitosti."
            icon={ListPlus}
          />
          <DashboardNavCard
            href="/moje-inzeraty"
            title="Moje inzeráty"
            description="Spravujte své aktivní nabídky a jejich stav."
            icon={Building2}
          />
          <DashboardNavCard
            href="/nemovitosti"
            title="Prohlížet nemovitosti"
            description="Prohlédněte si trh a inspiraci u ostatních nabídek."
            icon={Search}
          />
        </div>
      </div>
    </PrivateSellerGate>
  );
}
