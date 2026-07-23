import Link from 'next/link';

type Props = {
  locationName: string;
};

export function ProgrammaticSeoRegisterCta({ locationName }: Props) {
  return (
    <section className="rounded-3xl bg-zinc-900 px-6 py-10 text-center text-white sm:px-10">
      <h2 className="text-2xl font-bold">Chcete jako první vědět o nových nabídkách?</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-300">
        Zaregistrujte se na XXREALIT a nastavte si upozornění pro {locationName}. Nové inzeráty,
        video prohlídky i tipy z trhu dostanete přímo do účtu.
      </p>
      <Link
        href="/registrace"
        className="mt-6 inline-block rounded-full bg-orange-500 px-8 py-3 text-sm font-semibold transition hover:bg-orange-400"
      >
        Registrovat zdarma
      </Link>
    </section>
  );
}
