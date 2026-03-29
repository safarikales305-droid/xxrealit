import type { Metadata } from 'next';
import Link from 'next/link';
import { CreatePropertyForm } from '@/components/create-property/create-property-form';

export const metadata: Metadata = {
  title: 'Create listing',
  description: 'Post a new video property listing',
};

export default function CreatePropertyPage() {
  return (
    <div className="flex min-h-full w-full max-w-full flex-col items-center justify-center overflow-x-hidden overflow-y-auto bg-[#fafafa] px-4 py-16">
      <div className="mb-10 w-full max-w-md text-center">
        <Link
          href="/"
          className="text-sm font-semibold text-[#e85d00] transition hover:text-[#ff6a00]"
        >
          ← Zpět na hlavní stránku
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
          Nový inzerát
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">
          Přidej video prohlídku — po uložení se objeví ve feedu.
        </p>
      </div>
      <CreatePropertyForm />
    </div>
  );
}
