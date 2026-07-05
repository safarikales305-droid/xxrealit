export type GamificationOfferConfig = {
  id: string;
  emoji: string;
  title: string;
  city: string;
  price: string;
  description: string;
  imageUrl?: string;
};

export type GamificationResultPageConfig = {
  title: string;
  subtitle: string;
  bullets: string[];
};

export type GamificationConfig = {
  gameTitle: string;
  introText: string;
  colors: {
    primary: string;
    secondary: string;
    background: string;
    accent: string;
  };
  offers: GamificationOfferConfig[];
  buttons: {
    buy: string;
    invest: string;
    sell: string;
    build: string;
    skip: string;
  };
  resultPages: Record<string, GamificationResultPageConfig>;
  rewardTitle: string;
  rewardDescription: string;
  formTitle: string;
  formSubtitle: string;
  thankYouTitle: string;
  thankYouSubtitle: string;
  soundsEnabled: boolean;
  closeModal?: {
    title: string;
    subtitle: string;
    benefits: string[];
    motivationText: string;
  };
};

export const DEFAULT_GAMIFICATION_CONFIG: GamificationConfig = {
  gameTitle: '🏙️ Staň se realitním magnátem',
  introText:
    'Rozhodujte o nabídkách nemovitostí a zjistěte, jaký typ realitního hráče jste. Hra trvá jen minutu!',
  colors: {
    primary: '#e85d00',
    secondary: '#1e3a5f',
    background: '#0f172a',
    accent: '#fbbf24',
  },
  offers: [
    {
      id: 'house',
      emoji: '🏠',
      title: 'Rodinný dům',
      city: 'Brno',
      price: '8 490 000 Kč',
      description: '5+kk, zahrada, garáž, klidná lokalita',
    },
    {
      id: 'flat',
      emoji: '🏢',
      title: 'Byt 3+kk',
      city: 'Praha',
      price: '12 200 000 Kč',
      description: 'Novostavba, metro 5 min, balkon',
    },
    {
      id: 'land',
      emoji: '🌳',
      title: 'Stavební pozemek',
      city: 'Olomouc',
      price: '2 150 000 Kč',
      description: '1 200 m², inženýrské sítě na hranici',
    },
    {
      id: 'dev',
      emoji: '🏗',
      title: 'Developerský projekt',
      city: 'Ostrava',
      price: '45 000 000 Kč',
      description: '12 bytových jednotek, výnos 6,2 %',
    },
    {
      id: 'cottage',
      emoji: '🏡',
      title: 'Chata u vody',
      city: 'Lipno',
      price: '3 890 000 Kč',
      description: 'Rekreační objekt, pronájem přes sezónu',
    },
    {
      id: 'commercial',
      emoji: '🏢',
      title: 'Komerční objekt',
      city: 'Plzeň',
      price: '18 700 000 Kč',
      description: 'Retail park, dlouhodobý nájemce',
    },
  ],
  buttons: {
    buy: '❤️ Koupil bych',
    invest: '💰 Investoval bych',
    sell: '📢 Prodal bych',
    build: '🏗 Postavil bych',
    skip: '⏭ Přeskočit',
  },
  resultPages: {
    BUYER: {
      title: '🏠 Kupující',
      subtitle: 'Hledáte svůj nový domov',
      bullets: [
        'Najděte svůj nový domov mezi tisíci nabídkami',
        'Uložte si oblíbené inzeráty a sledujte změny cen',
        'Kontaktujte makléře přímo z portálu',
      ],
    },
    INVESTOR: {
      title: '🏢 Investor',
      subtitle: 'Hledáte výnosné příležitosti',
      bullets: [
        'Najděte investiční příležitosti dříve než ostatní',
        'Filtrujte podle výnosu a lokality',
        'Sledujte tržní trendy v reálném čase',
      ],
    },
    AGENT: {
      title: '📢 Makléř',
      subtitle: 'Chcete prodávat nemovitosti',
      bullets: [
        'Publikujte neomezené množství inzerátů',
        'Automaticky sdílejte na Facebook, TikTok a další sítě',
        'Získejte leady od aktivních zájemců',
      ],
    },
    DEVELOPER: {
      title: '🏗 Developer',
      subtitle: 'Stavíte a prodáváte projekty',
      bullets: [
        'Získejte nové klienty pro vaše projekty',
        'Prezentujte developerské nabídky profesionálně',
        'Propojte se s investory a makléři',
      ],
    },
    MIXED: {
      title: '🎯 Realitní hráč',
      subtitle: 'Máte široký zájem o realitní trh',
      bullets: [
        'Objevte všechny možnosti portálu XXREALIT',
        'Sledujte inzeráty, příspěvky i investiční tipy',
        'Zaregistrujte se a odemkněte plný potenciál',
      ],
    },
  },
  rewardTitle: '🎁 Vyhráli jste dárek!',
  rewardDescription: 'Zadejte e-mail a získejte bonus po registraci na portálu XXREALIT.',
  formTitle: 'Získejte svou odměnu',
  formSubtitle: 'E-mail je povinný — bez něj odměnu nemůžeme doručit.',
  thankYouTitle: '🎉 Děkujeme!',
  thankYouSubtitle: 'Na váš e-mail jsme zaregistrovali odměnu. Dokončete registraci a využijte portál naplno.',
  soundsEnabled: true,
  closeModal: {
    title: 'Připojte se k XXREALIT zdarma',
    subtitle: 'Máte několik možností:',
    benefits: [
      'Přidávání inzerátů zdarma',
      'Sdílení na sociální sítě',
      'Tipařský program',
      'Bonusové akce',
      'Komunita profesionálů',
    ],
    motivationText: '🎁 Po registraci získáte přístup ke všem funkcím portálu.',
  },
};

export const DEFAULT_GAMIFICATION_SETTINGS = {
  enabled: false,
  gameType: 'real_estate_magnate',
  audience: 'UNAUTHENTICATED',
  showOnHome: true,
  showOnShorts: true,
  showOnClassic: true,
  showOnPosts: false,
  showOnProfessionalProfile: false,
  triggerType: 'SHORTS_VIEWS',
  triggerShortsViews: 3,
  triggerSecondsOnSite: 45,
  triggerPagesVisited: 2,
  frequency: 'ONCE',
  decisionsCount: 8,
  offerIntervalSec: 3,
  bonusCredits: 500,
  bonusDescription: 'Bonusové kredity po registraci',
  onCloseAction: 'OPEN_REGISTRATION_MODAL',
  closeModalPromoEnabled: true,
  autoEmailMarketing: true,
  autoWhatsAppCampaign: true,
  autoCrm: true,
};

export type GamificationDecisionAction = 'buy' | 'invest' | 'sell' | 'build' | 'skip';

export type GamificationVisitorType = 'BUYER' | 'INVESTOR' | 'AGENT' | 'DEVELOPER' | 'MIXED';

export function detectVisitorType(
  scores: Record<GamificationDecisionAction, number>,
): GamificationVisitorType {
  const ranked = [
    ['buy', scores.buy ?? 0],
    ['invest', scores.invest ?? 0],
    ['sell', scores.sell ?? 0],
    ['build', scores.build ?? 0],
  ] as Array<[GamificationDecisionAction, number]>;
  ranked.sort((a, b) => b[1] - a[1]);

  const top = ranked[0]?.[1] ?? 0;
  if (top <= 0) return 'MIXED';

  const winners = ranked.filter(([, v]) => v === top && v > 0);
  if (winners.length > 1) return 'MIXED';

  const key = winners[0]?.[0];
  if (key === 'buy') return 'BUYER';
  if (key === 'invest') return 'INVESTOR';
  if (key === 'sell') return 'AGENT';
  if (key === 'build') return 'DEVELOPER';
  return 'MIXED';
}
