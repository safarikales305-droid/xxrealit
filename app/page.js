async function loadProperties() {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    return { items: [], error: "Missing NEXT_PUBLIC_API_URL." };
  }

  try {
    const res = await fetch(`${base.replace(/\/+$/, "")}/properties`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return { items: [], error: `API error (${res.status}).` };
    }

    const data = await res.json();
    return { items: Array.isArray(data) ? data : [], error: null };
  } catch {
    return { items: [], error: "Cannot connect to backend API." };
  }
}

export default async function Home() {
  const { items, error } = await loadProperties();

  return (
    <main className="container">
      <h1>XXREALIT</h1>
      <p>Realitni platforma nove generace</p>
      <a className="cta" href="#properties">
        Zobrazit nemovitosti
      </a>

      <section id="properties">
        {error ? (
          <p className="error">{error}</p>
        ) : items.length === 0 ? (
          <p className="muted">Zatim zadne nemovitosti.</p>
        ) : (
          <ul>
            {items.slice(0, 8).map((item, idx) => (
              <li key={item.id ?? idx}>
                {item.title ?? "Nemovitost"}{" "}
                {item.price ? `- ${item.price}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
