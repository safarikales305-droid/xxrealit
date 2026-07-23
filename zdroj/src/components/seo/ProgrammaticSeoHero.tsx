import Image from 'next/image';
import Link from 'next/link';

type Props = {
  h1: string;
  subtitle: string;
  imageUrl: string;
  imageAlt: string;
  hasListings: boolean;
  totalCount: number;
};

export function ProgrammaticSeoHero({
  h1,
  subtitle,
  imageUrl,
  imageAlt,
  hasListings,
  totalCount,
}: Props) {
  return (
    <section className="relative overflow-hidden rounded-3xl bg-zinc-900 text-white">
      <div className="absolute inset-0">
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          className="object-cover opacity-50"
          sizes="(max-width: 1024px) 100vw, 1200px"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/90 via-zinc-900/75 to-zinc-900/40" />
      </div>
      <div className="relative px-6 py-14 sm:px-10 sm:py-20 lg:py-24">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-orange-300">
          XXREALIT · Průvodce lokalitou
        </p>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{h1}</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-zinc-200 sm:text-lg">{subtitle}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/registrace"
            className="rounded-full bg-orange-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-400"
          >
            Registrovat zdarma
          </Link>
          <Link
            href="/nemovitosti"
            className="rounded-full border border-white/30 bg-white/10 px-6 py-2.5 text-sm font-semibold backdrop-blur transition hover:bg-white/20"
          >
            {hasListings ? `Zobrazit ${totalCount} nabídek` : 'Prohlédnout reality'}
          </Link>
        </div>
      </div>
    </section>
  );
}
