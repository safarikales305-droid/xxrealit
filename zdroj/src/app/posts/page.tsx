import { redirect } from 'next/navigation';

type Props = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstQueryValue(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function PostsAliasPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const tabRaw = firstQueryValue(sp.tab);
  const categoryRaw = firstQueryValue(sp.category);
  const safeTab =
    tabRaw === 'shorts' || tabRaw === 'classic' || tabRaw === 'posts'
      ? tabRaw
      : 'posts';

  const params = new URLSearchParams();
  params.set('tab', safeTab);
  if (categoryRaw && safeTab === 'posts') {
    params.set('category', categoryRaw);
  }

  redirect(`/?${params.toString()}`);
}
