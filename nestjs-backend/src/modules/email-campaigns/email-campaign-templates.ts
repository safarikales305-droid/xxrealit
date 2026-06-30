export const EMAIL_CAMPAIGN_VARIABLES = [
  'fullName',
  'firstName',
  'email',
  'phone',
  'company',
  'role',
  'registrationLink',
  'unsubscribeLink',
  'senderName',
] as const;

export type EmailCampaignVariable = (typeof EMAIL_CAMPAIGN_VARIABLES)[number];

export const DEFAULT_SEQUENCE_STEPS = [
  {
    stepOrder: 0,
    name: 'Den 0: první e-mail',
    delayDays: 0,
    delayHours: 0,
    subject: 'Pozvánka na portál XXrealit',
    htmlContent: `<p>Dobrý den {{firstName}},</p>
<p>na portálu <strong>XXrealit</strong> sdílíme nemovitosti a profesionální obsah z realitního trhu.</p>
<p>Registrace je zdarma: <a href="{{registrationLink}}">{{registrationLink}}</a></p>
<p>S pozdravem<br>{{senderName}}</p>`,
    textContent:
      'Dobrý den {{firstName}},\n\nna portálu XXrealit sdílíme nemovitosti a profesionální obsah.\nRegistrace: {{registrationLink}}\n\nS pozdravem\n{{senderName}}',
  },
  {
    stepOrder: 1,
    name: 'Den 2: připomenutí',
    delayDays: 2,
    delayHours: 0,
    subject: 'Připomenutí — XXrealit',
    htmlContent: `<p>Dobrý den {{firstName}},</p>
<p>připomínáme pozvánku na portál XXrealit. Váš profil můžete založit zde:</p>
<p><a href="{{registrationLink}}">{{registrationLink}}</a></p>`,
    textContent: 'Dobrý den {{firstName}},\n\npřipomínáme pozvánku: {{registrationLink}}',
  },
  {
    stepOrder: 2,
    name: 'Den 5: dotaz na registraci',
    delayDays: 5,
    delayHours: 0,
    subject: 'Máte zájem o profil na XXrealit?',
    htmlContent: `<p>Dobrý den {{firstName}},</p>
<p>máte zájem založit si profil na XXrealit? Pomůžeme vám s registrací.</p>
<p><a href="{{registrationLink}}">Dokončit registraci</a></p>`,
    textContent: 'Dobrý den {{firstName}},\n\nzájem o profil? {{registrationLink}}',
  },
  {
    stepOrder: 3,
    name: 'Den 10: pozvánka do komunity',
    delayDays: 10,
    delayHours: 0,
    subject: 'Připojte se ke komunitě XXrealit',
    htmlContent: `<p>Dobrý den {{firstName}},</p>
<p>připojte se ke komunitě profesionálů a sledujte novinky z trhu.</p>
<p><a href="{{registrationLink}}">Vstoupit do komunity</a></p>`,
    textContent: 'Dobrý den {{firstName}},\n\nkomunita XXrealit: {{registrationLink}}',
  },
] as const;

export function listCampaignTemplates() {
  return [
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
        {
          stepOrder: 0,
          name: 'Hlavní e-mail',
          delayDays: 0,
          delayHours: 0,
          subject: 'Zpráva z XXrealit',
          htmlContent: '<p>Dobrý den {{firstName}},</p><p>{{senderName}}</p>',
          textContent: 'Dobrý den {{firstName}},',
        },
      ],
      variables: EMAIL_CAMPAIGN_VARIABLES,
    },
  ];
}
