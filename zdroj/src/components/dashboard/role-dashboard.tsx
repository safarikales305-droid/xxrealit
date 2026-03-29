type Props = {
  title: string;
  description: string;
};

export function RoleDashboard({ title, description }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200/90 bg-white p-8 shadow-[0_2px_24px_-8px_rgba(0,0,0,0.06)]">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
        {title}
      </h1>
      <p className="mt-4 max-w-prose text-[15px] leading-relaxed text-zinc-600">
        {description}
      </p>
    </div>
  );
}
