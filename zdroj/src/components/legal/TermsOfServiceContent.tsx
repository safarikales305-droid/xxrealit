import Link from 'next/link';

export function TermsOfServiceContent() {
  return (
    <>
      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Úvodní ustanovení</h2>
        <p className="mt-2">
          Tyto podmínky užívání (dále jen „Podmínky“) upravují používání internetového portálu{' '}
          <a
            href="https://www.xxrealit.cz"
            className="font-semibold text-[#e85d00] hover:underline"
            rel="noopener noreferrer"
          >
            www.xxrealit.cz
          </a>{' '}
          provozovaného pod značkou XXRealit (dále jen „portál“ nebo „služba“). Používáním portálu
          potvrzujete, že jste se s těmito Podmínkami seznámili a souhlasíte s nimi.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Registrace a uživatelský účet</h2>
        <p className="mt-2">
          Některé funkce portálu vyžadují registraci. Jste povinni uvádět pravdivé údaje a chránit
          přístupové údaje před zneužitím. Za činnost provedenou prostřednictvím vašeho účtu nesete
          odpovědnost vy, pokud k zneužití nedošlo bez vašeho zavinění.
        </p>
        <p className="mt-2">
          Provozovatel může účet pozastavit nebo zrušit při porušení těchto Podmínek, zneužití služby
          nebo na základě právní povinnosti.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Obsah a inzeráty</h2>
        <p className="mt-2">
          Uživatelé mohou na portál vkládat obsah včetně inzerátů nemovitostí, příspěvků, fotografií a
          videí. Za vložený obsah odpovídá uživatel, který jej zveřejnil. Obsah nesmí porušovat právní
          předpisy, práva třetích osob ani dobré mravy.
        </p>
        <p className="mt-2">
          Uživatel uděluje provozovateli nevýhradní licenci k zobrazení a technickému zpracování
          obsahu v rozsahu nezbytném pro provoz služby.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Propojení se sociálními sítěmi</h2>
        <p className="mt-2">
          Portál umožňuje propojení s účty třetích stran (např. Facebook). Použití těchto funkcí se
          řídí také podmínkami příslušných poskytovatelů. Zpracování osobních údajů při propojení je
          popsáno v{' '}
          <Link href="/privacy-policy" className="font-semibold text-[#e85d00] hover:underline">
            Zásadách ochrany osobních údajů
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Omezení odpovědnosti</h2>
        <p className="mt-2">
          Portál slouží jako informační a komunikační platforma. Provozovatel neodpovídá za správnost
          údajů v inzerátech uživatelů, za dostupnost služeb třetích stran ani za škodu vzniklou
          používáním obsahu jiných uživatelů, pokud zákon nestanoví jinak.
        </p>
        <p className="mt-2">
          Služba je poskytována „tak jak je“. Provozovatel si vyhrazuje právo službu upravovat,
          omezit nebo dočasně přerušit z technických či provozních důvodů.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Změny podmínek</h2>
        <p className="mt-2">
          Provozovatel může tyto Podmínky měnit. Aktuální znění je vždy zveřejněno na této stránce.
          Pokračováním v používání portálu po změně vyjadřujete souhlas s novým zněním.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-zinc-900">Rozhodné právo</h2>
        <p className="mt-2">
          Tyto Podmínky se řídí právním řádem České republiky. Případné spory budou řešeny příslušnými
          soudy České republiky, pokud zákon nestanoví jinak.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
        <h2 className="text-lg font-semibold text-zinc-900">Kontakt</h2>
        <p className="mt-2">
          Dotazy k podmínkám užívání směřujte na{' '}
          <a href="mailto:info@xxrealit.cz" className="font-semibold text-[#e85d00] hover:underline">
            info@xxrealit.cz
          </a>
          .
        </p>
        <p className="mt-1">
          Web:{' '}
          <a
            href="https://www.xxrealit.cz"
            className="font-semibold text-[#e85d00] hover:underline"
            rel="noopener noreferrer"
          >
            https://www.xxrealit.cz
          </a>
        </p>
      </section>
    </>
  );
}
