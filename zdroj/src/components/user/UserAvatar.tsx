import Link from 'next/link';
import { nestAbsoluteAssetUrl } from '@/lib/api';

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? 'U').toUpperCase();
}

type Props = {
  name: string;
  avatarUrl?: string | null;
  href?: string | null;
  size?: 'sm' | 'md';
  className?: string;
};

const sizeClass = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
} as const;

export function UserAvatar({ name, avatarUrl, href, size = 'sm', className = '' }: Props) {
  const label = name.trim() || 'Uživatel';
  const avatarSrc = avatarUrl?.trim() ? nestAbsoluteAssetUrl(avatarUrl) : '';
  const body = avatarSrc ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={avatarSrc} alt="" className="size-full rounded-full object-cover" />
  ) : (
    <span
      className="flex size-full items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-rose-500 font-semibold text-white"
      aria-hidden
    >
      {initialsFromName(label)}
    </span>
  );

  const shell = (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-full ring-1 ring-zinc-200/80 ${sizeClass[size]} ${className}`.trim()}
    >
      {body}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0 hover:opacity-90" title={label}>
        {shell}
      </Link>
    );
  }

  return shell;
}
