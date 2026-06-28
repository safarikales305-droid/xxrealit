export type DefaultSection = {
  anchor: string;
  sectionType: string;
  sortOrder: number;
  icon?: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  bgStyle?: string;
  accentColor?: string;
};

export type DefaultFaq = {
  question: string;
  answerHtml: string;
  sortOrder: number;
};

export const DEFAULT_PRESENTATION_PAGE = {
  locale: 'cs',
  slug: 'o-portalu',
  isPublished: true,
  metaTitle: 'Představení portálu XXREALIT | Moderní realitní sociální síť',
  metaDescription:
    'XXREALIT je moderní realitní portál s video Shorts, klasickou inzercí, sociální sítí, tipařským programem, marketplace služeb a kreditním systémem. Inzerujte zdarma a plaťte až za skutečný zájem.',
  metaKeywords:
    'XXREALIT, realitní portál, nemovitosti, video shorts, tipař, makléř, realitní kancelář, inzerce zdarma, marketplace nemovitostí',
  ogImageUrl: 'https://xxrealit.cz/icons/icon-512.png',
  canonicalUrl: 'https://xxrealit.cz/o-portalu',
  heroTitle: 'XXREALIT — budoucnost realitního marketingu',
  heroSubtitle:
    'Propojujeme majitele nemovitostí, makléře, developery, investory a tipaře v jedné moderní platformě s videem, sociální sítí a férovým obchodním modelem.',
  heroBadgeText: 'Představení portálu',
  faqTitle: 'Časté dotazy',
  heroCtaLabel: 'Registrovat zdarma',
  heroCtaUrl: '/registrace',
  heroSecondaryCtaLabel: 'Přidat nemovitost',
  heroSecondaryCtaUrl: '/inzerat/pridat',
  heroGradientFrom: '#ff6a00',
  heroGradientTo: '#ff3c00',
  contactEmail: null,
  contactPhone: '+420000000000',
  contactAddress: 'XXrealit.cz — online realitní portál',
};

export const DEFAULT_PRESENTATION_SECTIONS: DefaultSection[] = [
  {
    anchor: 'uvod',
    sectionType: 'intro',
    sortOrder: 10,
    icon: '🏠',
    title: 'Úvod',
    subtitle: 'Vše pro realitní trh na jednom místě',
    bodyHtml:
      '<p>XXREALIT spojuje <strong>video prezentace</strong>, <strong>klasickou inzerci</strong>, <strong>sociální síť</strong> a <strong>profesionální nástroje</strong> pro makléře, kanceláře i soukromé inzerenty. Portál je navržen pro rychlou orientaci kupujících, efektivní práci profesionálů a férové odměňování tipařů.</p>',
    ctaLabel: 'Prozkoumat portál',
    ctaUrl: '/registrace',
    bgStyle: 'white',
  },
  {
    anchor: 'o-portalu',
    sectionType: 'feature',
    sortOrder: 20,
    icon: '🌐',
    title: 'O portálu',
    subtitle: 'Technologická platforma pro celý realitní ekosystém',
    bodyHtml:
      '<p>XXREALIT není jen inzertní server. Je to <strong>digitální ekosystém</strong>, kde se potkávají zájemci o nemovitosti, vlastníci, makléři, developeři, stavební firmy, finanční poradci a investoři. Uživatelé mohou sledovat obsah ve formátu Shorts, procházet klasické inzeráty, komunikovat přes WhatsApp centrum a budovat si veřejný profesionální profil.</p>',
    bgStyle: 'muted',
  },
  {
    anchor: 'proc-vznikl',
    sectionType: 'feature',
    sortOrder: 30,
    icon: '💡',
    title: 'Proč vznikl XXREALIT',
    subtitle: 'Reakce na zastaralé inzertní modely',
    bodyHtml:
      '<p>Tradiční portály často účtují vysoké poplatky bez garance výsledku. XXREALIT vznikl proto, aby nabídl <strong>transparentní model</strong>: inzerce zdarma, platba až za ověřený zájem a moderní prezentace nemovitostí prostřednictvím videa a sociálních funkcí.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'hlavni-vyhody',
    sectionType: 'benefits-grid',
    sortOrder: 40,
    icon: '⭐',
    title: 'Hlavní výhody',
    subtitle: 'Proč si portál oblíbí uživatelé i profesionálové',
    bodyHtml:
      '<ul><li>Inzerce zdarma — platíte až za výsledek</li><li>Video Shorts pro maximální dosah</li><li>Sociální síť a sledování profesionálů</li><li>Tipařský program s odměnou</li><li>WhatsApp a e-mail centrum</li><li>Administrační nástroje a statistiky</li></ul>',
    bgStyle: 'gradient',
    accentColor: '#ff6a00',
  },
  {
    anchor: 'shorts',
    sectionType: 'feature',
    sortOrder: 50,
    icon: '🎬',
    title: 'Video Shorts',
    subtitle: 'Prezentace nemovitostí ve formátu, který lidé milují',
    bodyHtml:
      '<p>Shorts feed umožňuje rychle prohlížet nemovitosti ve <strong>vertikálním videu</strong> s hudbou, fotkami a klíčovými informacemi. Ideální pro mobilní uživatele a organické sdílení na sociálních sítích.</p>',
    ctaLabel: 'Sledovat Shorts',
    ctaUrl: '/',
    bgStyle: 'white',
  },
  {
    anchor: 'klasicka-inzerce',
    sectionType: 'feature',
    sortOrder: 60,
    icon: '🏘',
    title: 'Klasická inzerce',
    subtitle: 'Detailní karty nemovitostí s filtry a mapou',
    bodyHtml:
      '<p>Klasický režim nabízí <strong>podrobné inzeráty</strong> s galerií, parametry, cenou, lokalitou a kontakty. Vhodné pro vážné zájemce, kteří chtějí detailní srovnání.</p>',
    ctaLabel: 'Prohlížet inzeráty',
    ctaUrl: '/nemovitosti',
    bgStyle: 'muted',
  },
  {
    anchor: 'socialni-sit',
    sectionType: 'feature',
    sortOrder: 70,
    icon: '👥',
    title: 'Sociální síť',
    subtitle: 'Příspěvky, sledování a komunita kolem nemovitostí',
    bodyHtml:
      '<p>Uživatelé mohou publikovat příspěvky, sledovat makléře a firmy, reagovat na obsah a budovat si důvěru v komunitě. Portál tak funguje jako <strong>profesionální sociální síť</strong> zaměřená na realitní trh.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'profesionalni-ucty',
    sectionType: 'feature',
    sortOrder: 80,
    icon: '👔',
    title: 'Profesionální účty',
    subtitle: 'Makléři, kanceláře, developeři a další role',
    bodyHtml:
      '<p>Profesionální účty nabízejí rozšířené profily, správu inzerátů, statistiky, marketingové nástroje a integraci s WhatsApp a e-mail centrem.</p>',
    ctaLabel: 'Registrovat profesionála',
    ctaUrl: '/registrace',
    bgStyle: 'muted',
  },
  {
    anchor: 'verejne-profily',
    sectionType: 'feature',
    sortOrder: 90,
    icon: '🪪',
    title: 'Veřejné profily',
    subtitle: 'Osobní značka každého uživatele',
    bodyHtml:
      '<p>Každý uživatel má veřejný profil s fotkou, popisem, inzeráty a hodnocením. Profily lze sdílet a propojovat s dalšími kanály.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'hodnoceni',
    sectionType: 'feature',
    sortOrder: 100,
    icon: '⭐',
    title: 'Hodnocení profesionálů',
    subtitle: 'Transparentní zpětná vazba od klientů',
    bodyHtml:
      '<p>Hodnocení pomáhá zájemcům vybrat spolehlivého makléře nebo firmu. Recenze zvyšují důvěryhodnost a podporují kvalitní služby na trhu.</p>',
    bgStyle: 'muted',
  },
  {
    anchor: 'marketplace',
    sectionType: 'feature',
    sortOrder: 110,
    icon: '🛒',
    title: 'Marketplace služeb',
    subtitle: 'Řemeslníci, poradci a další služby k nemovitostem',
    bodyHtml:
      '<p>Marketplace propojuje vlastníky a kupující s <strong>řemeslníky, finančními poradci</strong> a dalšími profesionály. Jedna platforma pro celý životní cyklus nemovitosti.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'whatsapp-centrum',
    sectionType: 'feature',
    sortOrder: 120,
    icon: '📱',
    title: 'WhatsApp centrum',
    subtitle: 'Komunikace tam, kde jsou vaši klienti',
    bodyHtml:
      '<p>Integrace WhatsApp umožňuje ověření telefonu, marketingové kampaně, notifikace a rychlý kontakt přímo z profilu nebo inzerátu.</p>',
    bgStyle: 'muted',
  },
  {
    anchor: 'email-centrum',
    sectionType: 'feature',
    sortOrder: 130,
    icon: '✉',
    title: 'E-mail centrum',
    subtitle: 'Šablony, kampaně a automatizace',
    bodyHtml:
      '<p>E-mail centrum spravuje transakční i marketingové e-maily, šablony a logy odeslání. Profesionálům šetří čas a zvyšuje konverze.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'import-inzeratu',
    sectionType: 'feature',
    sortOrder: 140,
    icon: '📥',
    title: 'Import inzerátů',
    subtitle: 'Hromadné nahrání z jiných zdrojů',
    bodyHtml:
      '<p>Import z URL, scraperů a partnerských feedů zrychluje onboarding kanceláří a makléřů. Inzeráty lze hromadně publikovat a spravovat.</p>',
    bgStyle: 'muted',
  },
  {
    anchor: 'administrace',
    sectionType: 'feature',
    sortOrder: 150,
    icon: '⚙',
    title: 'Administrace',
    subtitle: 'Moderní admin panel pro správu celého portálu',
    bodyHtml:
      '<p>Administrace zahrnuje správu uživatelů, inzerátů, kreditů, marketingu, WhatsApp kampaní, statistik a obsahu — vše z jednoho přehledného rozhraní.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'statistiky',
    sectionType: 'feature',
    sortOrder: 160,
    icon: '📊',
    title: 'Statistiky',
    subtitle: 'Data pro rozhodování',
    bodyHtml:
      '<p>Statistiky návštěvnosti, konverzí, inzerátů a kampaní pomáhají optimalizovat výkon a ROI marketingových aktivit.</p>',
    bgStyle: 'muted',
  },
  {
    anchor: 'reklama',
    sectionType: 'feature',
    sortOrder: 170,
    icon: '📣',
    title: 'Reklama',
    subtitle: 'Bonusové akce, popupy a promo obsah',
    bodyHtml:
      '<p>Reklamní nástroje zahrnují bonusové akce, popup okna, push notifikace a promo profily pro zvýšení viditelnosti.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'kreditni-system',
    sectionType: 'feature',
    sortOrder: 180,
    icon: '💳',
    title: 'Kreditní systém',
    subtitle: 'Férové platby za kontakty a služby',
    bodyHtml:
      '<p>Kreditní systém umožňuje dobíjení kreditu, bonusové kredity a transparentní účtování za odemčení kontaktů či prémiové funkce.</p>',
    bgStyle: 'muted',
  },
  {
    anchor: 'tipari',
    sectionType: 'feature',
    sortOrder: 190,
    icon: '💡',
    title: 'Tipařský program',
    subtitle: 'Vydělávejte doporučením nemovitostí',
    bodyHtml:
      '<p>Kdokoliv se může <strong>zdarma registrovat jako tipař</strong>. Pokud doporučí nemovitost, která bude úspěšně prodána nebo pronajata prostřednictvím makléře či realitní kanceláře na XXREALIT, může získat <strong>finanční odměnu</strong>.</p>',
    ctaLabel: 'Stát se tipařem',
    ctaUrl: '/registrace',
    bgStyle: 'gradient',
    accentColor: '#7c3aed',
  },
  {
    anchor: 'tipar-proces',
    sectionType: 'process',
    sortOrder: 200,
    icon: '🔄',
    title: 'Jak funguje tipařský program',
    subtitle: '5 jednoduchých kroků k odměně',
    bodyHtml: JSON.stringify([
      { step: 1, title: 'Najdu nemovitost', text: 'Objevím vhodnou nemovitost v okolí nebo online.' },
      { step: 2, title: 'Odešlu tip', text: 'Pošlu tip přes portál XXREALIT s fotkami a kontaktem.' },
      { step: 3, title: 'Makléř převezme případ', text: 'Ověřený profesionál kontaktuje majitele.' },
      { step: 4, title: 'Proběhne obchod', text: 'Nemovitost je prodána nebo pronajata.' },
      { step: 5, title: 'Tipař získá odměnu', text: 'Po úspěšném obchodu obdržíte finanční odměnu.' },
    ]),
    bgStyle: 'white',
  },
  {
    anchor: 'inzerce-zdarma',
    sectionType: 'feature',
    sortOrder: 210,
    icon: '🆓',
    title: 'Inzerujte zdarma',
    subtitle: 'Bez poplatků za zveřejnění',
    bodyHtml:
      '<p>Majitel nemovitosti může vložit inzerát <strong>zdarma</strong>. Neplatí za samotné zveřejnění — platba proběhne až za skutečný ověřený kontakt zájemce.</p>',
    ctaLabel: 'Přidat inzerát zdarma',
    ctaUrl: '/inzerat/pridat',
    bgStyle: 'gradient',
    accentColor: '#059669',
  },
  {
    anchor: 'platba-za-zajemce',
    sectionType: 'feature',
    sortOrder: 220,
    icon: '✅',
    title: 'Platba až za skutečný zájem',
    subtitle: 'Platíte za výsledky, ne za inzerci',
    bodyHtml:
      '<p>Za relevantní kontakt se považuje například: <strong>telefonát</strong>, <strong>kontaktní formulář</strong>, <strong>WhatsApp zpráva</strong>, <strong>rezervace prohlídky</strong> nebo <strong>ověřená poptávka</strong>. Výhodou je, že platíte pouze za výsledky.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'vyhody-soukrome-osoby',
    sectionType: 'benefits-grid',
    sortOrder: 230,
    icon: '🏡',
    title: 'Výhody pro soukromé osoby',
    subtitle: 'Prodávejte nebo pronajímejte bez zbytečných nákladů',
    bodyHtml:
      '<ul><li>Inzerce zdarma</li><li>Video prezentace</li><li>Platba až za kontakt</li><li>Tipařský program</li></ul>',
    bgStyle: 'muted',
  },
  {
    anchor: 'vyhody-makleri',
    sectionType: 'benefits-grid',
    sortOrder: 240,
    icon: '🤝',
    title: 'Výhody pro makléře',
    subtitle: 'Nástroje pro moderní makléřskou praxi',
    bodyHtml:
      '<ul><li>Veřejný profil a hodnocení</li><li>Shorts a sociální dosah</li><li>Tipy od tipařů</li><li>WhatsApp a CRM</li></ul>',
    ctaLabel: 'Registrovat makléře',
    ctaUrl: '/registrace',
    bgStyle: 'white',
  },
  {
    anchor: 'vyhody-rk',
    sectionType: 'benefits-grid',
    sortOrder: 250,
    icon: '🏢',
    title: 'Výhody pro realitní kanceláře',
    subtitle: 'Škálovatelná platforma pro tým',
    bodyHtml:
      '<ul><li>Hromadný import inzerátů</li><li>Správa makléřů</li><li>Marketingové kampaně</li><li>Statistiky a admin</li></ul>',
    ctaLabel: 'Registrovat kancelář',
    ctaUrl: '/registrace',
    bgStyle: 'muted',
  },
  {
    anchor: 'vyhody-developeri',
    sectionType: 'benefits-grid',
    sortOrder: 260,
    icon: '🏗',
    title: 'Výhody pro developery',
    subtitle: 'Prezentace projektů a novostaveb',
    bodyHtml:
      '<ul><li>Profesionální firemní profil</li><li>Video a klasické inzeráty</li><li>Lead generace</li><li>Reklamní nástroje</li></ul>',
    ctaLabel: 'Registrovat developera',
    ctaUrl: '/registrace',
    bgStyle: 'white',
  },
  {
    anchor: 'vyhody-stavebni-firmy',
    sectionType: 'benefits-grid',
    sortOrder: 270,
    icon: '🔨',
    title: 'Výhody pro stavební firmy',
    subtitle: 'Marketplace a viditelnost služeb',
    bodyHtml:
      '<ul><li>Profil řemeslníka / firmy</li><li>Poptávky od uživatelů</li><li>Hodnocení a reference</li><li>Propojení s inzeráty</li></ul>',
    ctaLabel: 'Registrovat stavební firmu',
    ctaUrl: '/registrace',
    bgStyle: 'muted',
  },
  {
    anchor: 'vyhody-investori',
    sectionType: 'benefits-grid',
    sortOrder: 280,
    icon: '📈',
    title: 'Výhody pro investory',
    subtitle: 'Přehled příležitostí na trhu',
    bodyHtml:
      '<ul><li>Tipy na nemovitosti</li><li>Sledování trhu přes Shorts</li><li>Kontakty na profesionály</li><li>Investiční příspěvky</li></ul>',
    ctaLabel: 'Registrovat investora',
    ctaUrl: '/registrace',
    bgStyle: 'white',
  },
  {
    anchor: 'vyhody-financni-poradci',
    sectionType: 'benefits-grid',
    sortOrder: 290,
    icon: '💼',
    title: 'Výhody pro finanční poradce',
    subtitle: 'Klienti v momentě koupě nemovitosti',
    bodyHtml:
      '<ul><li>Profesionální profil</li><li>Propojení s kupujícími</li><li>Marketplace služeb</li><li>Důvěryhodnost přes hodnocení</li></ul>',
    ctaLabel: 'Registrovat finančního poradce',
    ctaUrl: '/registrace',
    bgStyle: 'muted',
  },
  {
    anchor: 'mobilni-aplikace',
    sectionType: 'feature',
    sortOrder: 300,
    icon: '📲',
    title: 'Mobilní aplikace',
    subtitle: 'PWA a mobilní zážitek',
    bodyHtml:
      '<p>Portál je optimalizován pro mobily jako <strong>progresivní webová aplikace (PWA)</strong> — rychlé načítání, instalace na plochu a push notifikace.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'bezpecnost',
    sectionType: 'feature',
    sortOrder: 310,
    icon: '🔒',
    title: 'Bezpečnost',
    subtitle: 'Ochrana dat a ověření uživatelů',
    bodyHtml:
      '<p>Bezpečnost zahrnuje ověření e-mailu a telefonu, správu souhlasů, moderaci obsahu a ochranu osobních údajů v souladu s GDPR.</p>',
    ctaLabel: 'Obchodní podmínky',
    ctaUrl: '/obchodni-podminky',
    bgStyle: 'muted',
  },
  {
    anchor: 'budouci-rozvoj',
    sectionType: 'feature',
    sortOrder: 320,
    icon: '🚀',
    title: 'Budoucí rozvoj',
    subtitle: 'Neustálé inovace platformy',
    bodyHtml:
      '<p>Plánujeme rozšíření o další jazykové mutace, pokročilé AI nástroje, hlubší integrace s bankami a pojišťovnami a nové moduly pro B2B partnery.</p>',
    bgStyle: 'white',
  },
  {
    anchor: 'kontakt',
    sectionType: 'feature',
    sortOrder: 330,
    icon: '📞',
    title: 'Kontakt',
    subtitle: 'Jsme tu pro vás',
    bodyHtml:
      '<p>Máte dotaz k portálu, partnerství nebo investici? Napište nám přes formulář zákaznické podpory — odpovíme co nejdříve.</p>',
    ctaLabel: 'Napsat na podporu',
    ctaUrl: 'support:',
    bgStyle: 'muted',
  },
  {
    anchor: 'cta',
    sectionType: 'cta-grid',
    sortOrder: 340,
    icon: '🎯',
    title: 'Začněte na XXREALIT',
    subtitle: 'Vyberte svou roli a registrujte se zdarma',
    bodyHtml: JSON.stringify([
      { label: 'Registrovat zdarma', url: '/registrace' },
      { label: 'Přidat nemovitost', url: '/inzerat/pridat' },
      { label: 'Registrovat makléře', url: '/registrace' },
      { label: 'Registrovat realitní kancelář', url: '/registrace' },
      { label: 'Registrovat stavební firmu', url: '/registrace' },
      { label: 'Registrovat developera', url: '/registrace' },
      { label: 'Registrovat investora', url: '/registrace' },
      { label: 'Registrovat finančního poradce', url: '/registrace' },
      { label: 'Registrovat řemeslníka', url: '/registrace' },
      { label: 'Stát se tipařem', url: '/registrace' },
      { label: 'Kontaktovat nás', url: 'support:' },
    ]),
    bgStyle: 'gradient',
    accentColor: '#ff6a00',
  },
];

export const DEFAULT_PRESENTATION_FAQ: DefaultFaq[] = [
  {
    question: 'Je registrace na XXREALIT zdarma?',
    answerHtml: '<p>Ano, základní registrace je zdarma pro všechny typy účtů.</p>',
    sortOrder: 1,
  },
  {
    question: 'Kolik stojí vložení inzerátu?',
    answerHtml:
      '<p>Vložení inzerátu je zdarma. Platíte až za ověřený kontakt zájemce dle ceníku portálu.</p>',
    sortOrder: 2,
  },
  {
    question: 'Jak funguje tipařský program?',
    answerHtml:
      '<p>Tipař odešle tip na nemovitost. Pokud dojde k úspěšnému obchodu přes portál, tipař může získat odměnu.</p>',
    sortOrder: 3,
  },
];
