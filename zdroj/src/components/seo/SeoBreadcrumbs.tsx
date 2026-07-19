import Link from 'next/link';

type Crumb = { name: string; path: string };

type Props = {
  items: Crumb[];
};

export function SeoBreadcrumbs({ items }: Props) {
  return (
    <nav aria-label="Drobečková navigace" className="text-sm text-zinc-500">
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <li key={item.path} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden>/</span> : null}
              {isLast ? (
                <span className="font-medium text-zinc-800">{item.name}</span>
              ) : (
                <Link href={item.path} className="hover:text-orange-600 hover:underline">
                  {item.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
