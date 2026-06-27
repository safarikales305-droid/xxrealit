import Link from 'next/link';

export function PortalIntroLink({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-orange-200/80 bg-orange-50/60 px-4 py-3 text-center text-sm text-zinc-700 ${className}`}>
      <p>Chcete se dozvědět více o portálu XXREALIT?</p>
      <Link
        href="/o-portalu"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-flex rounded-full border-2 border-orange-400 bg-white px-5 py-2 text-sm font-bold text-orange-700 transition hover:bg-orange-50"
      >
        Představení portálu
      </Link>
    </div>
  );
}
