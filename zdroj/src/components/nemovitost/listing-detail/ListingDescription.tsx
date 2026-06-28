'use client';

export function ListingDescription({ text }: { text: string }) {
  return (
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-semibold text-zinc-900">Popis nemovitosti</h2>
      <div className="prose prose-zinc mt-4 max-w-[800px] text-base leading-relaxed text-zinc-800">
        {text.split(/\n{2,}/).map((para, i) => (
          <p key={i} className="mb-4 whitespace-pre-wrap last:mb-0">
            {para}
          </p>
        ))}
      </div>
    </section>
  );
}
