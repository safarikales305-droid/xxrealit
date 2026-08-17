import Link from 'next/link';

const cards = [
  { href: '/reality', label: 'Reality', desc: 'Aktuální nabídky nemovitostí' },
  { href: '/ubytovani', label: 'Ubytování', desc: 'Hotely a apartmány' },
  { href: '/?tab=posts', label: 'Příspěvky', desc: 'Komunita a novinky' },
  { href: '/profesionalove', label: 'Profesionálové a firmy', desc: 'Makléři, firmy a řemeslníci' },
];

export function SeoDiscoverPortalBlock() {
  return (
    <section className="mt-10 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
      <h2 className="text-lg font-bold text-zinc-900">Objevte XXREALIT</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-white bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
          >
            <p className="font-semibold text-zinc-900">{card.label}</p>
            <p className="mt-1 text-sm text-zinc-600">{card.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
