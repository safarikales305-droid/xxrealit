export default function AdminSeoSitemapPage() {
  return (
    <div className="rounded-2xl border bg-white p-5 text-sm">
      <p className="mb-4 text-zinc-600">Veřejné sitemapy portálu XXREALIT:</p>
      <ul className="space-y-2">
        {['/sitemap.xml', '/sitemap-listings.xml', '/sitemap-locations.xml', '/sitemap-seo-pages.xml'].map((url) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className="font-mono text-orange-600 hover:underline">
              {url}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
