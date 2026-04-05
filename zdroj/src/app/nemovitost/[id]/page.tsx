import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatCzk,
  getMockPropertyById,
  propertyTypeLabel,
} from '@/lib/rental/mock-properties';

type Props = { params: Promise<{ id: string }> };

export default async function NemovitostDetailPage({ params }: Props) {
  const { id } = await params;
  const property = getMockPropertyById(id);
  if (!property) {
    notFound();
  }

  return (
    <div>
      <Link
        href="/nemovitosti"
        className="text-sm font-semibold text-[#e85d00] transition hover:text-[#ff6a00]"
      >
        ← Zpět na výpis
      </Link>

      <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-md">
        <div className="relative aspect-[21/9] w-full max-h-[420px] bg-zinc-100">
          <Image
            src={property.imageUrl}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="(max-width: 1152px) 100vw, 1152px"
            unoptimized
          />
        </div>
        <div className="p-6 sm:p-8">
          <p className="text-sm font-medium text-zinc-500">
            {propertyTypeLabel(property.type)} · {property.location}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
            {property.title}
          </h1>
          <p className="mt-4 text-2xl font-bold text-[#e85d00]">{formatCzk(property.price)}</p>
          <div className="prose prose-zinc mt-6 max-w-none">
            <p className="text-[15px] leading-relaxed text-zinc-700">{property.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
