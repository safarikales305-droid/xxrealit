export default function AdminSeoRobotsPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="mb-3 text-zinc-600">Veřejný soubor robots.txt:</p>
      <a href="/robots.txt" target="_blank" rel="noreferrer" className="font-mono text-orange-600 hover:underline">
        /robots.txt
      </a>
      <p className="mt-4 text-zinc-500">
        Globální indexaci lze vypnout v SEO Dashboard → Globální metadata (robots index).
      </p>
    </div>
  );
}
