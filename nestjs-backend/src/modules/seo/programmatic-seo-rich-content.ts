import type { CzGeoLocation } from './cz-geo-locations.data';
import type { ProgrammaticSeoIntent } from './programmatic-seo-intents';

const SITE = 'XXREALIT';

export type ProgrammaticSeoSection = {
  id: string;
  h2: string;
  h3?: string[];
  paragraphs: string[];
};

export type ProgrammaticSeoRichContent = {
  heroSubtitle: string;
  heroImageUrl: string;
  heroImageAlt: string;
  sections: ProgrammaticSeoSection[];
  bodyText: string;
  faq: Array<{ question: string; answer: string }>;
  wordCount: number;
};

function inLoc(loc: CzGeoLocation): string {
  return `v ${loc.locative}`;
}

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pick<T>(arr: T[], seed: number, offset = 0): T {
  return arr[(seed + offset) % arr.length]!;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=1600&q=80',
  'https://images.unsplash.com/photo-1516156008625-3a9d6067fab5?w=1600&q=80',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1600&q=80',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80',
  'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd7?w=1600&q=80',
  'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1600&q=80',
];

const CITY_HERO: Record<string, string> = {
  praha: 'https://images.unsplash.com/photo-1541849546-216549ae216d?w=1600&q=80',
  brno: 'https://images.unsplash.com/photo-1590069261209-7bd80f68d34d?w=1600&q=80',
  ostrava: 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=1600&q=80',
  plzen: 'https://images.unsplash.com/photo-1587974928449-77dc3faac0c0?w=1600&q=80',
  liberec: 'https://images.unsplash.com/photo-1596436889106-be35e843f974?w=1600&q=80',
  olomouc: 'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1600&q=80',
  'ceske-budejovice': 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd7?w=1600&q=80',
  pardubice: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=1600&q=80',
  'hradec-kralove': 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1600&q=80',
};

function heroSubtitle(intent: ProgrammaticSeoIntent, loc: CzGeoLocation, seed: number): string {
  const variants = [
    `Najděte ideální nemovitost ${inLoc(loc)} — jedné z nejvyhledávanějších lokalit v České republice.`,
    `Kompletní průvodce ${intent.label.toLowerCase()} ${inLoc(loc)}: trh, ceny, tipy a aktuální nabídky na ${SITE}.`,
    `Plánujete ${intent.label.toLowerCase()} ${inLoc(loc)}? Připravili jsme podrobný přehled lokality, trhu a praktických rad.`,
    `Objevte možnosti bydlení a investic ${inLoc(loc)} — od historického centra po moderní čtvrti.`,
  ];
  return pick(variants, seed);
}

function buildLocalitySection(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
  seed: number,
): ProgrammaticSeoSection {
  const pop = loc.population
    ? `S přibližně ${loc.population.toLocaleString('cs-CZ')} obyvateli `
    : '';
  const kindLabel =
    loc.kind === 'kraj'
      ? 'kraj'
      : loc.kind === 'mesto'
        ? 'město'
        : loc.kind === 'obec'
          ? 'obec'
          : 'lokalita';

  const history = [
    `${loc.name} má bohatou historii, která formuje charakter celé oblasti. ${pop}lokalita kombinuje tradici s moderním rozvojem a nabízí pestrou skladbu zástavby — od historických jader po nové rezidenční projekty.`,
    `Území ${loc.name} se dlouhodobě vyvíjí jako významné ${kindLabel} regionu. Architektura i urbanistická struktura odrážejí několik stavebních epoch, což činí trh s nemovitostmi pestrým a zajímavým pro různé typy kupujících.`,
    `Historické kořeny ${loc.name} jsou stále patrné v uliční síti, veřejných prostorech i kulturním životě. Současně město aktivně investuje do infrastruktury, což pozitivně ovlivňuje atraktivitu ${intent.label.toLowerCase()} ${inLoc(loc)}.`,
  ];

  const character = [
    `Charakter ${loc.name} je dán kombinací klidnějších rezidenčních čtvrtí a živějších center. Pro rodiny bývá důležitá dostupnost škol a přírody, pro mladé profesionály rychlé spojení do větších aglomerací a pro investory stabilní poptávka po kvalitním bydlení.`,
    `${loc.name} láká jak na trvalé bydlení, tak na rekreaci či investici. V centru dominuje městský rytmus, v okrajových částech najdete více zeleně a klidu — ideální pro ty, kdo hledají ${intent.label.toLowerCase()} s vyváženým poměrem komfortu a ceny.`,
    `Místní atmosféra spojuje komunitní život s dostupností služeb. Každá část ${loc.name} má svůj rytmus: historické jádro, sídliště, vilové čtvrti i nové developerské zóny nabízejí odlišné životní styly.`,
  ];

  const audience = [
    `Lokalita je vhodná pro rodiny s dětmi díky školám a školkám, pro seniory hledající klid, pro mladé páry začínající bydlení i pro investory sledující dlouhodobý růst hodnoty nemovitostí.`,
    `Nejvíce ${inLoc(loc)} uspějí ti, kdo oceňují kombinaci dostupnosti, služeb a kvality životního prostředí. ${intent.label} zde dává smysl jak pro vlastní bydlení, tak jako součást investičního portfolia.`,
    `Poptávka ${inLoc(loc)} táhnou především rodiny, profesionálové dojíždějící do větších center a lidé hledající druhý domov. Každá skupina klade důraz na jiné parametry — velikost, dopravu, cenu nebo okolí.`,
  ];

  const pros = [
    `Mezi výhody bydlení ${inLoc(loc)} patří rozvinutá občanská vybavenost, dostupnost zdravotní péče, pestrá nabídka volnočasových aktivit a relativně stabilní realitní trh s pravidelnou obnovou nabídky.`,
    `Obyvatelé oceňují kombinaci městských služeb a možnosti rychlého výjezdu do přírody. Dopravní napojení umožňuje dojíždění i bez auta, což zvyšuje atraktivitu ${intent.label.toLowerCase()} pro širší okruh zájemců.`,
    `Silnou stránkou lokality je diverzita nemovitostí — od cenově dostupných variant po prémiové projekty. To umožňuje najít ${intent.label.toLowerCase()} pro různé rozpočty i životní fáze.`,
  ];

  const cons = [
    `Na druhou stranu je třeba počítat s vyšší konkurencí u atraktivních částí města, sezónními výkyvy poptávky a nutností pečlivě prověřit stav starší zástavby či dopravní zátěž v konkrétní ulici.`,
    `Nevýhodou může být omezená nabídka parkování v centrech, vyšší ceny v žádaných čtvrtích nebo déle trvající schvalovací procesy u nových staveb. Důkladná lokalizace konkrétní adresy je proto klíčová.`,
    `Jako u každé populární lokality platí, že ne všechny části ${loc.name} jsou stejně atraktivní. Rozdíly v ceně, hluku, dostupnosti MHD i budoucím rozvoji mohou být značné i na krátké vzdálenosti.`,
  ];

  const development = [
    `Budoucí rozvoj ${loc.name} směřuje k modernizaci infrastruktury, revitalizaci brownfieldů a postupnému doplňování bytové zástavby. To může postupně zvyšovat hodnotu kvalitně situovaných nemovitostí.`,
    `Plánované investice do dopravy, veřejných prostor a komerčních zón signalizují dlouhodobý zájem o rozvoj území. Pro kupující ${intent.label.toLowerCase()} ${inLoc(loc)} je rozumné sledovat územní plány a připravované projekty.`,
    `Město aktivně pracuje na zlepšení kvality bydlení — od zeleně po energetickou efektivitu budov. Nové projekty často nabízejí moderní standardy, které mohou být konkurenční výhodou oproti starší zástavbě.`,
  ];

  const transport = [
    `Dopravní dostupnost ${loc.name} zahrnuje silniční i železniční spojení, větší města často i městskou hromadnou dopravu. Při výběru nemovitosti doporučujeme ověřit dojezdové časy do práce, škol a nákupních center v různých denních dobách.`,
    `Pro mnoho obyvatel je klíčové napojení na dálniční síť i regionální vlakové spojení. Lokality blíže zastávkám MHD a nádraží bývají cenově náročnější, ale nabízejí vyšší komfort každodenního života.`,
    `Kombinace cyklostezek, chodníků a veřejné dopravy postupně zlepšuje mobilitu bez auta. To je důležité kritérium zejména při ${intent.label.toLowerCase()} pro mladší domácnosti.`,
  ];

  const schools = [
    `Vzdělávací infrastruktura ${inLoc(loc)} zahrnuje základní i střední školy různého zaměření. Rodiny často vybírají konkrétní čtvrť podle kapacit a kvality nejbližší školy — tento faktor výrazně ovlivňuje cenu nemovitostí.`,
    `Kromě státních škol jsou k dispozici i soukromé a bilingvní varianty. Při koupi ${intent.label.toLowerCase()} pro rodinné bydlení stojí za to mapovat docházkové vzdálenosti a dostupnost kroužků.`,
    `Školní zařízení v okolí bývají pro dlouhodobé bydlení stabilizačním faktorem — rodiče preferují lokality, kde děti mohou dozrávat bez nutnosti stěhování při přechodu na vyšší stupně.`,
  ];

  const nature = [
    `Přírodní okolí ${loc.name} nabízí parky, lesy, vodní plochy či cyklostezky podle charakteru regionu. Blízkost zeleně zvyšuje kvalitu života a často přináší prémiu v ceně nemovitostí.`,
    `Volný čas ${inLoc(loc)} lze trávit sportem, kulturními akcemi i výlety do okolí. Pro aktivní rodiny je důležitá dostupnost hřišť, bazénů a rekreačních tras.`,
    `Kombinace městského komfortu a přírody je jedním z hlavních argumentů pro ${intent.label.toLowerCase()} v této lokalitě — zejména pokud hledáte vyvážený životní styl.`,
  ];

  const work = [
    `Trh práce v regionu ${loc.name} je tvořen kombinací lokálních firem, služeb a dojíždění do větších center. Blízkost průmyslových zón, kancelářských parků nebo univerzit ovlivňuje poptávku po různých typech bydlení.`,
    `Podnikatelé oceňují dostupnost kancelářských prostor a logistických uzlů. Pro zaměstnance na home office je zase klíčová kvalita internetového připojení a klidné prostředí.`,
    `Ekonomická aktivita regionu podporuje stabilní realitní trh — i v obdobích bez velkého množství inzerátů zůstává zájem o kvalitní ${intent.label.toLowerCase()} ${inLoc(loc)}.`,
  ];

  const paragraphs = [
    pick(history, seed),
    pick(character, seed, 1),
    pick(audience, seed, 2),
    `**Výhody bydlení:** ${pick(pros, seed, 3)}`,
    `**Na co si dát pozor:** ${pick(cons, seed, 4)}`,
    `**Budoucí rozvoj:** ${pick(development, seed, 5)}`,
    `**Doprava:** ${pick(transport, seed, 6)}`,
    `**Školy a školky:** ${pick(schools, seed, 7)} Obecná dostupnost mateřských škol bývá větších obcích dobrá, u konkrétní adresy však ověřte kapacity a fronty.`,
    `**Zdravotnictví a obchody:** Základní zdravotní péče a obchodní síť ${inLoc(loc)} pokrývají běžné potřeby domácností. Pro specializovanou péči může být výhodné blízké větší město v regionu.`,
    `**Sport a kultura:** ${pick(nature, seed, 8)} Kulturní kalendář zahrnuje festivaly, divadla, muzea i komunitní akce, které oživují místní život.`,
    `**Práce a podnikání:** ${pick(work, seed, 9)}`,
    `**Investiční perspektiva:** Nemovitosti ${inLoc(loc)} mohou dlouhodobě plnit roli zachování hodnoty kapitálu, zejména v dobře situovaných částech s rozvojovým potenciálem.`,
  ];

  return {
    id: 'locality',
    h2: `Představení lokality ${loc.name}`,
    h3: [
      'Historie a charakter',
      'Pro koho je lokalita vhodná',
      'Výhody a nevýhody',
      'Doprava, školy a služby',
      'Příroda, kultura a práce',
    ],
    paragraphs,
  };
}

function buildMarketSection(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
  seed: number,
): ProgrammaticSeoSection {
  const propertyFocus =
    intent.propertyTypeKey === 'byt'
      ? 'byty různých dispozic'
      : intent.propertyTypeKey === 'dum'
        ? 'rodinné domy, vilové domy a řadovky'
        : intent.propertyTypeKey === 'pozemek'
          ? 'stavební a investiční pozemky'
          : intent.propertyTypeKey === 'chata_chalupa'
            ? 'chaty a chalupy'
            : 'nemovitosti různých typů';

  const paragraphs = [
    `Realitní trh ${inLoc(loc)} je tvořen především ${propertyFocus}. Nabídka se mění podle sezóny, úrokových sazeb i lokální poptávky — na ${SITE} sledujeme vývoj a průběžně doplňujeme nové inzeráty.`,
    `Nejžádanější části ${loc.name} bývají blízko centra, zastávek MHD, škol a zeleně. Kupující ${intent.label.toLowerCase()} často porovnávají několik čtvrtí najednou, protože rozdíly v ceně za m² mohou být výrazné.`,
    `Aktuální trendy zahrnují vyšší zájem o energeticky úsporné budovy, flexibilní dispozice a nemovitosti s možností parkování. U ${intent.label.toLowerCase()} ${inLoc(loc)} roste také poptávka po kvalitním vizuálním prezentování — fotografie a video prohlídky zrychlují rozhodování.`,
    `Kupující nejčastěji hledají transparentní cenu, stav technických rozvodů, dispoziční řešení a dojezdovou vzdálenost. U starších objektů je klíčová historie rekonstrukcí; u novostaveb certifikace a záruky developera.`,
    `Při koupi doporučujeme ověřit zápis v katastru nemovitostí, stav zástav a případných věcných břemen, náklady na provoz a plánované investice do okolí. Využijte také srovnání více nabídek na ${SITE}.`,
    `Prodejci by měli připravit kompletní dokumentaci, realisticky ocenit nemovitost a zvolit kvalitní prezentaci. Dobře popsaný inzerát s aktuálními fotografiemi výrazně zkracuje dobu prodeje ${intent.label.toLowerCase()} ${inLoc(loc)}.`,
    pick(
      [
        `Na trhu ${inLoc(loc)} se pravidelně objevují i investiční příležitosti — například nemovitosti vhodné k pronájmu nebo rekonstrukci. Důležité je mít jasný plán a rozpočet ještě před první prohlídkou.`,
        `Sledování počtu dnů v nabídce u srovnatelných nemovitostí pomáhá pochopit, zda je cena konkurenceschopná. ${SITE} umožňuje porovnávat aktuální i historické trendy.`,
        `Místní realitní kanceláře a ověření makléři na portálu mohou urychlit celý proces — od ocenění po právní servis.`,
      ],
      seed,
      11,
    ),
  ];

  return {
    id: 'market',
    h2: `Přehled realitního trhu — ${intent.label} ${loc.name}`,
    h3: [
      'Typy nemovitostí',
      'Nejžádanější části',
      'Trendy a poptávka',
      'Tipy při koupi a prodeji',
    ],
    paragraphs,
  };
}

function buildPricingSection(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
  seed: number,
): ProgrammaticSeoSection {
  const paragraphs = [
    `Ceny ${intent.label.toLowerCase()} ${inLoc(loc)} se průběžně mění podle lokality, stavu nemovitosti, dispozice a aktuální nabídky na trhu. Přesná čísla závisí na konkrétní ulici, patře, orientaci i vybavení.`,
    `Obecně platí, že centrum a prestižní čtvrti dosahují vyšších cen za m², zatímco okrajové části nabízejí dostupnější varianty. U rodinných domů hraje roli velikost pozemku, příjezdová komunikace a náklady na údržbu.`,
    `Na ${SITE} zobrazujeme aktuální ceny u každého inzerátu, jakmile jsou k dispozici. Do té doby slouží tato stránka jako informační průvodce lokality a trhem — bez prázdného obsahu nebo chybových hlášek.`,
    pick(
      [
        `Pro orientační srovnání sledujte nabídky v podobných částech ${loc.name} a v okolních obcích — rozdíl může být značný i na krátké vzdálenosti.`,
        `Investoři často porovnávají výnos z pronájmu s náklady na financování; u ${intent.label.toLowerCase()} je důležité počítat s rezervou na rekonstrukce.`,
        `Cenové mapy a statistiky na portálu budeme doplňovat automaticky, jakmile v lokalitě přibude dostatek reálných transakčních dat z inzerátů.`,
      ],
      seed,
      13,
    ),
    `**Důležité upozornění:** Uvedené informace mají informativní charakter. Pro závazné ocenění konkrétní nemovitosti doporučujeme odborný posudek nebo konzultaci s makléřem specializovaným ${inLoc(loc)}.`,
  ];

  return {
    id: 'pricing',
    h2: `Ceny nemovitostí ${inLoc(loc)}`,
    paragraphs,
  };
}

function buildPlatformSection(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
  seed: number,
): ProgrammaticSeoSection {
  const paragraphs = [
    `${SITE} propojuje majitele, makléře a zájemce o ${intent.label.toLowerCase()} ${inLoc(loc)} na jednom místě. Každý inzerát může obsahovat fotogalerii, video prohlídku, mapu a přímý kontakt — bez zbytečných prostředníků tam, kde to dává smysl.`,
    `Portál je navržen pro rychlé vyhledávání, srovnávání a sdílení nabídek. Jakmile v lokalitě ${loc.name} přibydou první inzeráty, automaticky se zobrazí v sekci aktuální nabídky na této stránce — bez nutnosti ruční úpravy.`,
    pick(
      [
        `Registrace na ${SITE} je zdarma a umožní vám nastavit hlídacího psa, ukládat oblíbené nabídky a být mezi prvními, kdo se dozví o novém ${intent.label.toLowerCase()} ${inLoc(loc)}.`,
        `Makléři a stavební firmy mohou na portálu prezentovat své služby cíleně podle lokality, což zvyšuje důvěryhodnost celého ekosystému.`,
        `Hypoteční a finanční poradci pomáhají proměnit hledání nemovitosti v reálný plán — s přehledem měsíčních nákladů i budoucích investic.`,
      ],
      seed,
      15,
    ),
    `Naším cílem je, aby každá lokalitní stránka — i bez aktuálních inzerátů — přinášela užitečné informace, odpovídala na časté dotazy a podporovala férový realitní trh ${inLoc(loc)}.`,
  ];

  return {
    id: 'platform',
    h2: `Proč ${SITE} pro ${intent.label.toLowerCase()} ${inLoc(loc)}`,
    paragraphs,
  };
}

function buildRichFaq(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
  seed: number,
): Array<{ question: string; answer: string }> {
  const where = inLoc(loc);
  const label = intent.label.toLowerCase();
  const base: Array<{ question: string; answer: string }> = [];

  if (!intent.isBrokerPage) {
    base.push(
      {
        question: `Jaká je průměrná cena — ${label} ${loc.name}?`,
        answer: `Ceny se liší podle čtvrti, stavu a vybavení. Na ${SITE} uvidíte aktuální ceny u každého inzerátu; tato stránka poskytuje kontext trhu ${where}.`,
      },
      {
        question: `Kolik je aktuálně nabídek ${label} ${where}?`,
        answer: `Počet inzerátů se mění denně. Nabídka se na této stránce aktualizuje automaticky — jakmile majitel nebo makléř přidá nemovitost, zobrazí se zde bez ručního zásahu.`,
      },
      {
        question: `Jak probíhá koupě ${label} ${where}?`,
        answer: `Vyberte inzerát, prostudujte detail, domluvte prohlídku a ověřte právní stav. Kontaktujte inzerenta přímo přes ${SITE} nebo prostřednictvím makléře.`,
      },
      {
        question: `Které části ${loc.name} jsou nejžádanější?`,
        answer: `Nejčastěji rostoucí poptávka je u center, MHD, škol a zeleně. Konkrétní preference se liší — rodiny hledají klid, mladí profesionálové dostupnost.`,
      },
      {
        question: `Je ${loc.name} vhodné pro investici do nemovitosti?`,
        answer: `Záleží na části města, typu nemovitosti a horizontu investice. Stabilní lokality s rozvojem infrastruktury bývají atraktivnější pro dlouhodobé držení.`,
      },
      {
        question: `Jak dlouho trvá prodej ${label} ${where}?`,
        answer: `Doba prodeje závisí na ceně, prezentaci a stavu nemovitosti. Kvalitní fotografie, video a realistické ocenění obvykle zkracují čas na trhu.`,
      },
      {
        question: `Co zkontrolovat před podpisem smlouvy?`,
        answer: `Katastr nemovitostí, zástavní práva, stav měřičů, plánované poplatky SVJ nebo družstva a soulad vybavení s realitou při prohlídce.`,
      },
      {
        question: `Lze ${label} ${where} financovat hypotékou?`,
        answer: `Ano, většina bank financuje standardní nemovitosti po jejich ocenění. Doporučujeme předběžné schválení a porovnání více nabídek hypoték.`,
      },
      {
        question: `Jak nastavit hlídacího psa pro ${loc.name}?`,
        answer: `Po registraci na ${SITE} zvolte lokalitu, typ nemovitosti a cenový rámec. O nových inzerátech vás upozorníme e-mailem nebo v účtu.`,
      },
      {
        question: `Mohu přidat vlastní inzerát ${where} zdarma?`,
        answer: `Ano, majitelé mohou na ${SITE} vystavit inzerát a oslovit zájemce přímo. Po publikaci se nabídka může objevit i na této lokalitní stránce.`,
      },
      {
        question: `Jaké dokumenty potřebuji k prodeji nemovitosti?`,
        answer: `Typicky list vlastnictví, energetický štítek, plná moc (pokud jedná zástupce), souhlas SVJ u bytů a případně stavební dokumentaci u rodinných domů.`,
      },
      {
        question: `Jak se liší starší a nová zástavba ${where}?`,
        answer: `Starší objekty mohou nabídnout lepší cenu a lokaci, novostavby moderní standard a nižší provozní náklady. Volba závisí na prioritách a rozpočtu.`,
      },
      {
        question: `Jsou na ${SITE} k dispozici video prohlídky?`,
        answer: `Ano, mnoho inzerátů obsahuje video, které šetří čas při prvním výběru. U ${label} ${where} doporučujeme kombinovat video s osobní prohlídkou.`,
      },
      {
        question: `Co dělat, když zatím nejsou žádné inzeráty?`,
        answer: `Stránka zůstává aktivní s průvodcem lokality a trhem. Registrujte se pro upozornění na nové nabídky nebo přidejte vlastní inzerát.`,
      },
      {
        question: `Jak ${SITE} ověřuje makléře ${where}?`,
        answer: `Profily makléřů obsahují reference, specializaci a kontakt. U prémiových partnerů najdete rozšířené informace a hodnocení klientů.`,
      },
    );
  } else {
    base.push(
      {
        question: `Jak najdu spolehlivou realitní kancelář ${where}?`,
        answer: `Na ${SITE} porovnáte profily podle lokality, specializace a hodnocení. Kontakt je dostupný po přihlášení.`,
      },
      {
        question: `Kolik stojí služby makléře ${loc.name}?`,
        answer: `Provize se liší podle typu transakce a rozsahu služeb. Vždy si předem vyjasněte rozsah a výši odměny písemně.`,
      },
      {
        question: `Proč používat ${SITE} místo klasických portálů?`,
        answer: `Kombinujeme inzeráty, video, mapy a profily makléřů. Lokalitní stránky poskytují kontext, nejen seznam odkazů.`,
      },
    );
  }

  base.push({
    question: `Proč je tato stránka užitečná i bez aktuálních inzerátů?`,
    answer: `Přináší podrobný popis ${loc.name}, přehled trhu, ceny, tipy a FAQ. Jakmile nabídky přibudou, zobrazí se automaticky.`,
  });

  const rotated = [...base.slice(seed % 3), ...base.slice(0, seed % 3)];
  return rotated.slice(0, Math.min(18, Math.max(12, rotated.length)));
}

const EXTRA_FILLER: Array<(intent: ProgrammaticSeoIntent, loc: CzGeoLocation) => string> = [
  (intent, loc) =>
    `Při plánování ${intent.label.toLowerCase()} ${inLoc(loc)} je užitečné navštívit lokalitu v různých denních dobách — ráno kvůli dopravě, večer kvůli hluku a o víkendu kvůli atmosféře okolí.`,
  (intent, loc) =>
    `Sousedé a místní komunitní skupiny často sdílejí praktické zkušenosti o konkrétních ulicích ${loc.name}, které nejsou patrné z inzerátu.`,
  (intent, loc) =>
    `Energetická náročnost budovy ovlivňuje měsíční náklady více, než si mnoho kupujících uvědomuje — zejména ${inLoc(loc)} s chladnějšími zimami.`,
  (intent, loc) =>
    `Parkovací situace bývá v ${loc.name} rozhodujícím faktorem — ověřte možnosti rezidentního parkování, garáže nebo pronájmu stání.`,
  (intent, loc) =>
    `Revitalizované brownfieldy a nové čtvrti ${inLoc(loc)} mohou nabídnout moderní standard za konkurenceschopnější cenu než historické jádro.`,
  (intent, loc) =>
    `Daňové a poplatkové aspekty vlastnictví — daň z nemovitosti, poplatky za odpad, zálohy na energie — patří do realistického rozpočtu každé domácnosti ${inLoc(loc)}.`,
  (intent, loc) =>
    `Sousedská komunita a místní spolky často pořádají akce, které pomáhají novým obyvatelům ${loc.name} rychleji se zorientovat a zapojit do života města.`,
];

export function buildProgrammaticRichContent(
  intent: ProgrammaticSeoIntent,
  loc: CzGeoLocation,
): ProgrammaticSeoRichContent {
  const seed = hashSeed(`${intent.slug}:${loc.slug}`);
  const sections = [
    buildLocalitySection(intent, loc, seed),
    buildMarketSection(intent, loc, seed),
    buildPricingSection(intent, loc, seed),
    buildPlatformSection(intent, loc, seed),
  ];

  let bodyParts = sections.flatMap((s) => s.paragraphs);
  let wordCount = countWords(bodyParts.join(' '));

  let fillerIdx = 0;
  while (wordCount < 1200 && fillerIdx < EXTRA_FILLER.length * 3) {
    const para = EXTRA_FILLER[fillerIdx % EXTRA_FILLER.length]!(intent, loc);
    const lastSection = sections[sections.length - 1]!;
    lastSection.paragraphs.push(para);
    bodyParts = sections.flatMap((s) => s.paragraphs);
    wordCount = countWords(bodyParts.join(' '));
    fillerIdx += 1;
  }

  const bodyText = bodyParts.join('\n\n');
  const faq = buildRichFaq(intent, loc, seed);
  const heroImageUrl = CITY_HERO[loc.slug] ?? pick(HERO_IMAGES, seed, 7);

  return {
    heroSubtitle: heroSubtitle(intent, loc, seed),
    heroImageUrl,
    heroImageAlt: `${intent.heading} ${loc.name} — fotografie lokality`,
    sections,
    bodyText,
    faq,
    wordCount,
  };
}
