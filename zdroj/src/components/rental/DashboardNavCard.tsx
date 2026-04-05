import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

type Props = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export function DashboardNavCard({ href, title, description, icon: Icon }: Props) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-md transition duration-200 hover:scale-[1.02] hover:border-[#ff6a00]/30 hover:shadow-lg"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff6a00]/15 to-[#ff3c00]/10 text-[#e85d00] transition group-hover:from-[#ff6a00]/25 group-hover:to-[#ff3c00]/15">
        <Icon className="h-6 w-6" strokeWidth={2} />
      </div>
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{description}</p>
      <span className="mt-4 text-sm font-semibold text-[#e85d00] transition group-hover:text-[#ff6a00]">
        Otevřít →
      </span>
    </Link>
  );
}
