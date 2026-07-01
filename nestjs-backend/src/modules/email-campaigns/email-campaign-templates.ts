import {
  buildXxrealitCampaignHtml,
  buildXxrealitCampaignText,
  defaultEditorBlocks,
  type EmailCampaignEditorBlocks,
} from './email-campaign-html-builder';

export const EMAIL_CAMPAIGN_VARIABLES = [
  'fullName',
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'role',
  'registrationLink',
  'unsubscribeLink',
  'senderName',
  'creditAmount',
  'portalName',
] as const;

export type EmailCampaignVariable = (typeof EMAIL_CAMPAIGN_VARIABLES)[number];

function stepFromBlocks(
  stepOrder: number,
  name: string,
  subject: string,
  blocks: EmailCampaignEditorBlocks,
  delayDays = 0,
  delayHours = 0,
) {
  return {
    stepOrder,
    name,
    delayDays,
    delayHours,
    subject,
    htmlContent: buildXxrealitCampaignHtml(blocks),
    textContent: buildXxrealitCampaignText(blocks),
  };
}

const PORTAL_INVITE_BLOCKS = defaultEditorBlocks({
  headline: 'Pozvánka na portál {{portalName}}',
  bodyHtml:
    '<p>Dobrý den {{firstName}},</p><p>na portálu <strong>{{portalName}}</strong> sdílíme nemovitosti a profesionální obsah z realitního trhu. Registrace je zdarma.</p><p>S pozdravem<br>{{senderName}}</p>',
  ctas: [{ label: 'Zaregistrovat se zdarma', url: '{{registrationLink}}' }],
  benefits: [
    { title: 'Profesionální prezentace', text: 'Prezentujte nemovitosti na moderním portálu.' },
    { title: 'Komunita profesionálů', text: 'Propojte se s makléři a partnery z trhu.' },
  ],
});

const CREDIT_BONUS_BLOCKS = defaultEditorBlocks({
  headline: 'Zaregistrujte se na {{portalName}} a získejte kredit {{creditAmount}}',
  bodyHtml:
    '<p>Dobrý den {{firstName}},</p><p>Přidejte se zdarma na realitní portál {{portalName}}. Po registraci přes tlačítko níže vám připíšeme bonusový kredit <strong>{{creditAmount}}</strong> na propagaci vašich inzerátů.</p>',
  creditAmount: '{{creditAmount}}',
  creditLabel: 'Bonus po registraci',
  ctas: [{ label: 'Získat kredit {{creditAmount}}', url: '{{registrationLink}}' }],
});

const REGISTRATION_REMINDER_BLOCKS = defaultEditorBlocks({
  headline: 'Připomenutí registrace na {{portalName}}',
  bodyHtml:
    '<p>Dobrý den {{firstName}},</p><p>připomínáme pozvánku na portál {{portalName}}. Váš profil můžete založit během několika minut.</p>',
  ctas: [{ label: 'Dokončit registraci', url: '{{registrationLink}}' }],
});

const BROKER_COOP_BLOCKS = defaultEditorBlocks({
  headline: 'Nabídka spolupráce pro makléře',
  bodyHtml:
    '<p>Dobrý den {{firstName}},</p><p>hledáme makléře, kteří chtějí prezentovat nemovitosti na portálu {{portalName}}. Nabízíme moderní nástroje, dosah a podporu propagace.</p>',
  ctas: [
    { label: 'Zjistit více', url: '{{registrationLink}}' },
    { label: 'Kontaktovat tým', url: 'https://xxrealit.cz/kontakt' },
  ],
  benefits: [
    { title: 'Větší dosah', text: 'Prezentace inzerátů na sociálních sítích a portálu.' },
    { title: 'Jednoduchá správa', text: 'Přehledný administrátorský panel.' },
  ],
});

const CONSTRUCTION_COOP_BLOCKS = defaultEditorBlocks({
  headline: 'Nabídka spolupráce pro stavební firmy',
  bodyHtml:
    '<p>Dobrý den {{firstName}},</p><p>portál {{portalName}} propojuje stavební firmy s realitními profesionály a investory. Zaregistrujte svou firmu a prezentujte realizace.</p>',
  ctas: [{ label: 'Registrovat firmu', url: '{{registrationLink}}' }],
  benefits: [
    { title: 'Viditelnost projektů', text: 'Prezentace realizací v komunitě.' },
    { title: 'Nové kontakty', text: 'Spolupráce s makléři a developery.' },
  ],
});

const COMMUNITY_INVITE_BLOCKS = defaultEditorBlocks({
  headline: 'Připojte se ke komunitě {{portalName}}',
  bodyHtml:
    '<p>Dobrý den {{firstName}},</p><p>připojte se ke komunitě profesionálů, sledujte novinky z trhu a sdílejte zkušenosti s kolegy.</p>',
  ctas: [{ label: 'Vstoupit do komunity', url: '{{registrationLink}}' }],
});

export const DEFAULT_SEQUENCE_STEPS = [
  stepFromBlocks(0, 'Den 0: první e-mail', 'Pozvánka na portál XXrealit', PORTAL_INVITE_BLOCKS),
  stepFromBlocks(
    1,
    'Den 2: připomenutí',
    'Připomenutí — XXrealit',
    REGISTRATION_REMINDER_BLOCKS,
    2,
  ),
  stepFromBlocks(
    2,
    'Den 5: dotaz na registraci',
    'Máte zájem o profil na XXrealit?',
    defaultEditorBlocks({
      headline: 'Máte zájem o profil na {{portalName}}?',
      bodyHtml:
        '<p>Dobrý den {{firstName}},</p><p>máte zájem založit si profil na {{portalName}}? Pomůžeme vám s registrací.</p>',
      ctas: [{ label: 'Dokončit registraci', url: '{{registrationLink}}' }],
    }),
    5,
  ),
  stepFromBlocks(
    3,
    'Den 10: pozvánka do komunity',
    'Připojte se ke komunitě XXrealit',
    COMMUNITY_INVITE_BLOCKS,
    10,
  ),
] as const;

export function listCampaignTemplates() {
  return [
    {
      key: 'portal_invitation',
      name: 'Pozvánka na portál',
      description: 'Jednorázová pozvánka s logem, výhodami a CTA.',
      steps: [
        stepFromBlocks(0, 'Pozvánka', 'Pozvánka na portál {{portalName}}', PORTAL_INVITE_BLOCKS),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'credit_bonus_10000',
      name: 'Bonusový kredit 10 000 Kč',
      description: 'Registrace s bonusem kreditu na propagaci.',
      steps: [
        stepFromBlocks(
          0,
          'Bonus kredit',
          'Získejte kredit {{creditAmount}} na {{portalName}}',
          CREDIT_BONUS_BLOCKS,
        ),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'registration_reminder',
      name: 'Připomenutí registrace',
      description: 'Připomínka nedokončené registrace.',
      steps: [
        stepFromBlocks(
          0,
          'Připomenutí',
          'Připomenutí registrace — {{portalName}}',
          REGISTRATION_REMINDER_BLOCKS,
        ),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'broker_cooperation',
      name: 'Nabídka spolupráce pro makléře',
      description: 'Oslovení makléřů s nabídkou spolupráce.',
      steps: [
        stepFromBlocks(
          0,
          'Spolupráce makléř',
          'Nabídka spolupráce pro makléře — {{portalName}}',
          BROKER_COOP_BLOCKS,
        ),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'construction_cooperation',
      name: 'Nabídka spolupráce pro stavební firmy',
      description: 'Oslovení stavebních firem.',
      steps: [
        stepFromBlocks(
          0,
          'Spolupráce stavební',
          'Nabídka spolupráce pro stavební firmy — {{portalName}}',
          CONSTRUCTION_COOP_BLOCKS,
        ),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'community_invitation',
      name: 'Pozvánka do komunity XXrealit',
      description: 'Pozvánka do komunity profesionálů.',
      steps: [
        stepFromBlocks(
          0,
          'Komunita',
          'Připojte se ke komunitě {{portalName}}',
          COMMUNITY_INVITE_BLOCKS,
        ),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'broker_outreach_sequence',
      name: 'Oslovení makléřů (4 kroky)',
      description: 'Den 0, 2, 5 a 10 — registrace na portál.',
      steps: DEFAULT_SEQUENCE_STEPS,
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
    {
      key: 'single_announcement',
      name: 'Jednorázový e-mail',
      description: 'Jeden krok bez sekvence.',
      steps: [
        stepFromBlocks(
          0,
          'Hlavní e-mail',
          'Zpráva z {{portalName}}',
          defaultEditorBlocks({
            headline: 'Zpráva z {{portalName}}',
            bodyHtml: '<p>Dobrý den {{firstName}},</p><p>{{senderName}}</p>',
            ctas: [],
          }),
        ),
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
  ];
}
