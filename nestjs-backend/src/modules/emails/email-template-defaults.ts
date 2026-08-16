export type EmailTemplateDefault = {
  key: string;
  name: string;
  category: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  variables: string[];
};

export const EMAIL_TEMPLATE_VARIABLES: Record<string, string[]> = {
  welcome_email: ['userName', 'ctaUrl', 'portalName', 'loginUrl'],
  password_reset: ['resetUrl', 'ctaUrl', 'portalName', 'loginUrl'],
  email_verification: ['verifyUrl', 'ctaUrl', 'portalName', 'loginUrl'],
  listing_shared: [
    'recipientName',
    'listingTitle',
    'listingLocation',
    'listingPrice',
    'listingType',
    'listingParams',
    'listingDescription',
    'listingUrl',
    'listingImageUrl',
    'senderMessage',
    'ctaUrl',
    'portalName',
  ],
  newsletter: ['subject', 'title', 'contentHtml', 'contentText', 'portalName'],
  promo_campaign: ['subject', 'title', 'contentHtml', 'contentText', 'ctaUrl', 'portalName'],
  worker_client_invitation: [
    'clientName',
    'workerName',
    'portalName',
    'completeRegistrationUrl',
    'setPasswordUrl',
    'loginUrl',
    'supportEmail',
  ],
  profile_onboarding_reminder: ['userName', 'profileUrl', 'ctaUrl', 'portalName', 'loginUrl'],
  contact_lead: [
    'ownerName',
    'listingTitle',
    'listingUrl',
    'leadName',
    'leadEmail',
    'leadPhone',
    'date',
    'time',
    'portalName',
  ],
  contact_lead_low_credit: ['ownerName', 'listingTitle', 'listingUrl', 'ctaUrl', 'portalName'],
  credit_top_up_confirmed: ['userName', 'amount', 'invoiceNumber', 'portalName', 'loginUrl'],
  client_registration_complete: ['clientName', 'portalName', 'loginUrl', 'profileUrl'],
  worker_portal_invitation: ['workerName', 'completeUrl', 'portalName', 'loginUrl'],
  worker_bonus_credit_gift: ['clientName', 'amount', 'workerName', 'portalUrl'],
  tipar_payout_request_received: ['userName', 'amount', 'portalName', 'loginUrl'],
  tipar_payout_approved: ['userName', 'amount', 'adminNote', 'portalName', 'loginUrl'],
  tipar_payout_rejected: ['userName', 'amount', 'adminNote', 'portalName', 'loginUrl'],
  tipar_payout_paid: ['userName', 'amount', 'adminNote', 'portalName', 'loginUrl'],
  system_notification: ['title', 'messageHtml', 'messageText', 'ctaUrl', 'portalName'],
  custom_message: ['subject', 'bodyHtml', 'bodyText', 'portalName'],
  whatsapp_followup_email: ['userName', 'messageHtml', 'messageText', 'ctaUrl', 'portalName'],
  worker_internal_message: ['workerName', 'portalName', 'messageUrl', 'ctaUrl'],
  worker_bulk_message: ['workerName', 'portalName', 'messageUrl', 'ctaUrl'],
  worker_profile_completion_reminder: ['workerName', 'portalName', 'profileUrl', 'ctaUrl'],
  worker_cooperation_cancel_confirmation: ['workerName', 'portalName', 'loginUrl'],
  worker_recruitment_target: ['workerName', 'targetName', 'portalName', 'workerPanelUrl', 'ctaUrl'],
  post_like_notification: [
    'authorName',
    'actorName',
    'postPreview',
    'postUrl',
    'ctaUrl',
    'portalName',
  ],
  post_comment_notification: [
    'authorName',
    'actorName',
    'postPreview',
    'commentPreview',
    'postUrl',
    'ctaUrl',
    'portalName',
  ],
  company_profile_created: ['companyName', 'companyUrl', 'portalName', 'ctaUrl'],
  company_claim_profile: ['companyName', 'companyUrl', 'claimUrl', 'portalName', 'ctaUrl'],
  company_new_review: [
    'companyName',
    'companyUrl',
    'reviewRating',
    'reviewPreview',
    'reviewUrl',
    'claimUrl',
    'portalName',
    'ctaUrl',
  ],
  company_data_review_request: ['companyName', 'companyUrl', 'message', 'portalName', 'ctaUrl'],
  company_report_response: ['companyName', 'message', 'portalName', 'ctaUrl'],
};

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplateDefault[] = [
  {
    key: 'welcome_email',
    name: 'Uvítací e-mail po registraci',
    category: 'system',
    subject: 'Vítejte na {{portalName}}',
    htmlContent:
      '<h1>Vítejte na {{portalName}}</h1><p>Dobrý den {{userName}}, váš účet je aktivní.</p><p><a href="{{ctaUrl}}">Dokončit profil</a></p><p><a href="{{loginUrl}}">Přihlásit se</a></p>',
    textContent:
      'Vítejte na {{portalName}}\n\nDobrý den {{userName}}, váš účet je aktivní.\n\nDokončit profil: {{ctaUrl}}\nPřihlášení: {{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.welcome_email,
  },
  {
    key: 'email_verification',
    name: 'Ověření e-mailu',
    category: 'system',
    subject: 'Ověření e-mailu na {{portalName}}',
    htmlContent:
      '<p>Dobrý den, pro ověření e-mailu klikněte na tlačítko níže.</p><p><a href="{{verifyUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Ověřit e-mail</a></p><p>Platnost odkazu je 24 hodin.</p>',
    textContent: 'Ověření e-mailu:\n\n{{verifyUrl}}\n\nPlatnost odkazu je 24 hodin.',
    variables: EMAIL_TEMPLATE_VARIABLES.email_verification,
  },
  {
    key: 'password_reset',
    name: 'Reset hesla',
    category: 'system',
    subject: 'Obnova hesla na {{portalName}}',
    htmlContent:
      '<h1>Obnova hesla</h1><p>Klikněte na tlačítko pro změnu hesla.</p><p><a href="{{resetUrl}}">Změnit heslo</a></p><p>Platnost odkazu je 60 minut.</p>',
    textContent: 'Obnova hesla\n\n{{resetUrl}}\n\nPlatnost odkazu je 60 minut.',
    variables: EMAIL_TEMPLATE_VARIABLES.password_reset,
  },
  {
    key: 'worker_client_invitation',
    name: 'Pozvánka klienta od pracovníka',
    category: 'worker_crm',
    subject: '{{workerName}} vás pozval na {{portalName}}',
    htmlContent: `<p>Dobrý den {{clientName}},</p>
<p>byli jste předregistrováni na <strong>{{portalName}}</strong> pracovníkem <strong>{{workerName}}</strong>.</p>
<p>Dokončete registraci, nastavte heslo a využijte výhod portálu — inzeráty, leady, kredity a profesionální nástroje.</p>
<p><a href="{{completeRegistrationUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700;margin-right:8px">Dokončit registraci</a>
<a href="{{setPasswordUrl}}" style="display:inline-block;background:#111827;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Nastavit heslo</a></p>
<p><a href="{{loginUrl}}">Přihlášení na portál</a></p>
<p>V případě dotazů nás kontaktujte: {{supportEmail}}</p>`,
    textContent: `Dobrý den {{clientName}},

Byli jste předregistrováni na {{portalName}} pracovníkem {{workerName}}.

Dokončit registraci: {{completeRegistrationUrl}}
Nastavit heslo: {{setPasswordUrl}}
Přihlášení: {{loginUrl}}

Podpora: {{supportEmail}}`,
    variables: EMAIL_TEMPLATE_VARIABLES.worker_client_invitation,
  },
  {
    key: 'client_registration_complete',
    name: 'Dokončení registrace klienta',
    category: 'worker_crm',
    subject: 'Registrace na {{portalName}} dokončena',
    htmlContent:
      '<p>Dobrý den {{clientName}},</p><p>Vaše registrace na {{portalName}} byla úspěšně dokončena.</p><p><a href="{{loginUrl}}">Přihlásit se</a> · <a href="{{profileUrl}}">Doplnit profil</a></p>',
    textContent:
      'Registrace dokončena.\n\nPřihlášení: {{loginUrl}}\nProfil: {{profileUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.client_registration_complete,
  },
  {
    key: 'listing_shared',
    name: 'Sdílení inzerátu e-mailem',
    category: 'marketing',
    subject: 'Byl vám sdílen inzerát z {{portalName}}',
    htmlContent:
      '<h1>Byl vám sdílen inzerát</h1><p><strong>{{listingTitle}}</strong></p><p>{{listingLocation}} · {{listingPrice}}</p><p>{{senderMessage}}</p><p><a href="{{listingUrl}}">Zobrazit inzerát</a></p>',
    textContent:
      'Sdílený inzerát: {{listingTitle}}\n{{listingLocation}} · {{listingPrice}}\n\n{{senderMessage}}\n\n{{listingUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.listing_shared,
  },
  {
    key: 'contact_lead',
    name: 'Nový lead (kontakt zobrazen)',
    category: 'system',
    subject: 'Zájemce o inzerát: {{listingTitle}}',
    htmlContent:
      '<p>Dobrý den {{ownerName}},</p><p><strong>Uživatel projevil zájem o váš inzerát.</strong></p><p><strong>Inzerát:</strong> {{listingTitle}}</p><p><strong>Jméno:</strong> {{leadName}}</p><p><strong>E-mail:</strong> {{leadEmail}}</p><p><strong>Telefon:</strong> {{leadPhone}}</p><p><strong>Datum:</strong> {{date}} {{time}}</p><p><a href="{{listingUrl}}">Otevřít inzerát</a></p>',
    textContent:
      'Nový zájemce o {{listingTitle}}\n\n{{leadName}}\n{{leadEmail}}\n{{leadPhone}}\n{{date}} {{time}}\n\n{{listingUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.contact_lead,
  },
  {
    key: 'contact_lead_low_credit',
    name: 'Nový lead – dobijte kredit',
    category: 'system',
    subject: 'Nový zájemce – dobijte kredit: {{listingTitle}}',
    htmlContent:
      '<p>Dobrý den {{ownerName}},</p><p>Máte nového zájemce o vaši nemovitost na {{portalName}}.</p><p>Pro zobrazení kontaktu si prosím dobijte kredit.</p><p><strong>Inzerát:</strong> {{listingTitle}}</p><p><a href="{{listingUrl}}">Otevřít inzerát</a></p>',
    textContent:
      'Nový zájemce – dobijte kredit.\n\n{{listingTitle}}\n{{listingUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.contact_lead_low_credit,
  },
  {
    key: 'credit_top_up_confirmed',
    name: 'Potvrzení dobití kreditů',
    category: 'system',
    subject: 'Dobití kreditu potvrzeno – {{amount}} Kč',
    htmlContent:
      '<p>Dobrý den {{userName}},</p><p>Vaše dobití kreditu ve výši <strong>{{amount}} Kč</strong> ({{invoiceNumber}}) bylo potvrzeno.</p><p><a href="{{loginUrl}}">Přejít na portál</a></p>',
    textContent: 'Dobití {{amount}} Kč potvrzeno ({{invoiceNumber}}).\n\n{{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.credit_top_up_confirmed,
  },
  {
    key: 'profile_onboarding_reminder',
    name: 'Doplnění profilu a WhatsApp',
    category: 'system',
    subject: 'Doplňte profil na {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{userName}},</p><p>Doplňte profil a ověřte WhatsApp, abyste mohli naplno využívat {{portalName}}.</p><p><a href="{{profileUrl}}">Doplnit profil</a></p>',
    textContent: 'Doplňte profil: {{profileUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.profile_onboarding_reminder,
  },
  {
    key: 'newsletter',
    name: 'Newsletter',
    category: 'marketing',
    subject: '{{subject}}',
    htmlContent: '<h1>{{title}}</h1><div>{{contentHtml}}</div>',
    textContent: '{{title}}\n\n{{contentText}}',
    variables: EMAIL_TEMPLATE_VARIABLES.newsletter,
  },
  {
    key: 'promo_campaign',
    name: 'Reklamní kampaň',
    category: 'marketing',
    subject: '{{subject}}',
    htmlContent: '<h1>{{title}}</h1><div>{{contentHtml}}</div><p><a href="{{ctaUrl}}">Zjistit více</a></p>',
    textContent: '{{title}}\n\n{{contentText}}\n\n{{ctaUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.promo_campaign,
  },
  {
    key: 'system_notification',
    name: 'Systémová notifikace',
    category: 'system',
    subject: '{{title}}',
    htmlContent: '<h1>{{title}}</h1><div>{{messageHtml}}</div>',
    textContent: '{{title}}\n\n{{messageText}}',
    variables: EMAIL_TEMPLATE_VARIABLES.system_notification,
  },
  {
    key: 'custom_message',
    name: 'Vlastní zpráva (komunikační centrum)',
    category: 'communication',
    subject: '{{subject}}',
    htmlContent: '<div>{{bodyHtml}}</div>',
    textContent: '{{bodyText}}',
    variables: EMAIL_TEMPLATE_VARIABLES.custom_message,
  },
  {
    key: 'whatsapp_followup_email',
    name: 'WhatsApp doprovodný e-mail',
    category: 'communication',
    subject: 'Zpráva z {{portalName}}',
    htmlContent: '<p>Dobrý den {{userName}},</p><div>{{messageHtml}}</div>',
    textContent: 'Dobrý den {{userName}},\n\n{{messageText}}',
    variables: EMAIL_TEMPLATE_VARIABLES.whatsapp_followup_email,
  },
  {
    key: 'worker_portal_invitation',
    name: 'Pozvánka pracovníka portálu',
    category: 'worker_crm',
    subject: 'Pozvánka do týmu {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{workerName}},</p><p>Byli jste pozváni jako pracovník portálu {{portalName}}.</p><p><a href="{{completeUrl}}">Dokončit registraci</a></p>',
    textContent: 'Pozvánka pracovníka.\n\n{{completeUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.worker_portal_invitation,
  },
  {
    key: 'worker_bonus_credit_gift',
    name: 'Dárek bonusového kreditu od pracovníka',
    category: 'worker_crm',
    subject: 'Dali jsme vám dárek {{amount}} Kč v kreditech na {{portalName}}',
    htmlContent: `<p>Dobrý den {{clientName}},</p>
<p>děkujeme za založení účtu na portálu <strong>{{portalName}}</strong>.</p>
<p>Jako dárek jsme vám připsali bonusový kredit ve výši <strong>{{amount}} Kč</strong>.</p>
<p>Kredit můžete využít na portálu {{portalName}} podle aktuálních pravidel a obchodních podmínek.</p>
<p><a href="{{portalUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Přejít na portál</a></p>
<p>Děkujeme,<br/>tým {{portalName}}</p>`,
    textContent: `Dobrý den {{clientName}},

děkujeme za založení účtu na portálu {{portalName}}.

Jako dárek jsme vám připsali bonusový kredit ve výši {{amount}} Kč.

Kredit můžete využít na portálu {{portalName}} podle aktuálních pravidel a obchodních podmínek.

{{portalUrl}}

Děkujeme,
tým {{portalName}}`,
    variables: EMAIL_TEMPLATE_VARIABLES.worker_bonus_credit_gift,
  },
  {
    key: 'tipar_payout_request_received',
    name: 'Žádost o výplatu přijata',
    category: 'system',
    subject: 'Přijali jsme vaši žádost o výplatu {{amount}} Kč',
    htmlContent:
      '<p>Dobrý den {{userName}},</p><p>vaši žádost o výplatu ve výši <strong>{{amount}} Kč</strong> jsme přijali ke zpracování.</p><p>O výsledku vás budeme informovat e-mailem.</p><p><a href="{{loginUrl}}">Přejít na portál</a></p>',
    textContent:
      'Dobrý den {{userName}},\n\nPřijali jsme vaši žádost o výplatu {{amount}} Kč.\n\n{{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.tipar_payout_request_received,
  },
  {
    key: 'tipar_payout_approved',
    name: 'Výplata schválena',
    category: 'system',
    subject: 'Vaše výplata {{amount}} Kč byla schválena',
    htmlContent:
      '<p>Dobrý den {{userName}},</p><p>žádost o výplatu <strong>{{amount}} Kč</strong> byla schválena.</p><p>{{adminNote}}</p><p><a href="{{loginUrl}}">Přejít na portál</a></p>',
    textContent:
      'Výplata {{amount}} Kč schválena.\n\n{{adminNote}}\n\n{{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.tipar_payout_approved,
  },
  {
    key: 'tipar_payout_rejected',
    name: 'Výplata zamítnuta',
    category: 'system',
    subject: 'Vaše žádost o výplatu {{amount}} Kč byla zamítnuta',
    htmlContent:
      '<p>Dobrý den {{userName}},</p><p>žádost o výplatu <strong>{{amount}} Kč</strong> byla zamítnuta.</p><p>{{adminNote}}</p><p><a href="{{loginUrl}}">Přejít na portál</a></p>',
    textContent:
      'Výplata {{amount}} Kč zamítnuta.\n\n{{adminNote}}\n\n{{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.tipar_payout_rejected,
  },
  {
    key: 'tipar_payout_paid',
    name: 'Výplata odeslána',
    category: 'system',
    subject: 'Výplata {{amount}} Kč byla odeslána na váš účet',
    htmlContent:
      '<p>Dobrý den {{userName}},</p><p>částka <strong>{{amount}} Kč</strong> byla odeslána na váš bankovní účet.</p><p>{{adminNote}}</p><p><a href="{{loginUrl}}">Přejít na portál</a></p>',
    textContent:
      'Výplata {{amount}} Kč odeslána.\n\n{{adminNote}}\n\n{{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.tipar_payout_paid,
  },
  {
    key: 'worker_internal_message',
    name: 'Nová interní zpráva pracovníkovi',
    category: 'worker_crm',
    subject: 'Nová interní zpráva na XXREALIT',
    htmlContent:
      '<p>Dobrý den,</p><p>v administraci portálu {{portalName}} vám byla odeslána nová interní zpráva.</p><p>Přihlaste se do svého účtu a zprávu si přečtěte.</p><p><a href="{{messageUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Přejít na pracovní panel</a></p><p>S pozdravem<br/>Tým {{portalName}}</p>',
    textContent:
      'Dobrý den,\n\nv administraci portálu {{portalName}} vám byla odeslána nová interní zpráva.\nPřihlaste se do svého účtu a zprávu si přečtěte.\n\n{{messageUrl}}\n\nS pozdravem\nTým {{portalName}}',
    variables: EMAIL_TEMPLATE_VARIABLES.worker_internal_message,
  },
  {
    key: 'worker_bulk_message',
    name: 'Hromadná zpráva pracovníkům',
    category: 'worker_crm',
    subject: 'Nová zpráva od administrace {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{workerName}},</p><p>Máte novou interní zprávu na portálu {{portalName}}. Přihlaste se a přečtěte si ji.</p><p><a href="{{messageUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Otevřít zprávu</a></p>',
    textContent:
      'Máte novou interní zprávu na portálu {{portalName}}. Přihlaste se a přečtěte si ji.\n\n{{messageUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.worker_bulk_message,
  },
  {
    key: 'worker_profile_completion_reminder',
    name: 'Výzva k dokončení profilu',
    category: 'worker_crm',
    subject: 'Dokončete svůj profil na {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{workerName}},</p><p>Váš profil pracovníka portálu není dokončený. Doplňte prosím chybějící údaje, aby bylo možné plně využívat pracovní nástroje.</p><p><a href="{{profileUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Dokončit profil</a></p>',
    textContent:
      'Váš profil pracovníka portálu není dokončený. Doplňte prosím chybějící údaje.\n\n{{profileUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.worker_profile_completion_reminder,
  },
  {
    key: 'worker_cooperation_cancel_confirmation',
    name: 'Potvrzení žádosti o ukončení spolupráce',
    category: 'worker_crm',
    subject: 'Přijali jsme vaši žádost o ukončení spolupráce',
    htmlContent:
      '<p>Dobrý den {{workerName}},</p><p>přijali jsme vaši žádost o ukončení spolupráce s portálem {{portalName}}. Administrátor ji nyní zpracuje.</p><p><a href="{{loginUrl}}">Přejít na portál</a></p>',
    textContent:
      'Přijali jsme vaši žádost o ukončení spolupráce s portálem {{portalName}}.\n\n{{loginUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.worker_cooperation_cancel_confirmation,
  },
  {
    key: 'worker_recruitment_target',
    name: 'Nový náborový cíl pro pracovníka',
    category: 'worker_crm',
    subject: 'Nový náborový cíl na {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{workerName}},</p><p>na portálu {{portalName}} máte nový náborový cíl: <strong>{{targetName}}</strong>.</p><p>Přihlaste se do pracovního panelu a podívejte se na doporučený postup.</p><p><a href="{{workerPanelUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Přejít na pracovní panel</a></p>',
    textContent:
      'Dobrý den {{workerName}},\n\nmáte nový náborový cíl: {{targetName}}.\n\n{{workerPanelUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.worker_recruitment_target,
  },
  {
    key: 'post_like_notification',
    name: 'Notifikace — like u příspěvku',
    category: 'marketing',
    subject: '{{actorName}} reagoval na váš příspěvek na {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{authorName}},</p><p><strong>{{actorName}}</strong> dal like vašemu příspěvku:</p><p><em>{{postPreview}}</em></p><p><a href="{{postUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Zobrazit příspěvek</a></p>',
    textContent:
      'Dobrý den {{authorName}},\n\n{{actorName}} dal like vašemu příspěvku:\n{{postPreview}}\n\n{{postUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.post_like_notification,
  },
  {
    key: 'post_comment_notification',
    name: 'Notifikace — komentář u příspěvku',
    category: 'marketing',
    subject: '{{actorName}} okomentoval váš příspěvek na {{portalName}}',
    htmlContent:
      '<p>Dobrý den {{authorName}},</p><p><strong>{{actorName}}</strong> přidal komentář k vašemu příspěvku:</p><p><em>{{postPreview}}</em></p><p>Komentář: {{commentPreview}}</p><p><a href="{{postUrl}}" style="display:inline-block;background:#ff5a00;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:700">Zobrazit příspěvek</a></p>',
    textContent:
      'Dobrý den {{authorName}},\n\n{{actorName}} okomentoval váš příspěvek:\n{{postPreview}}\n\nKomentář: {{commentPreview}}\n\n{{postUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.post_comment_notification,
  },
  {
    key: 'company_profile_created',
    name: 'Profil firmy byl vytvořen',
    category: 'company_directory',
    subject: 'Profil firmy {{companyName}} na {{portalName}}',
    htmlContent:
      '<p>Dobrý den,</p><p>na portálu {{portalName}} byl vytvořen profil firmy <strong>{{companyName}}</strong> z veřejných rejstříkových údajů.</p><p><a href="{{companyUrl}}">Zobrazit profil firmy</a></p>',
    textContent:
      'Na portálu {{portalName}} byl vytvořen profil firmy {{companyName}}.\n\n{{companyUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.company_profile_created,
  },
  {
    key: 'company_claim_profile',
    name: 'Převzít profil firmy',
    category: 'company_directory',
    subject: 'Převezměte profil firmy {{companyName}}',
    htmlContent:
      '<p>Dobrý den,</p><p>profil firmy <strong>{{companyName}}</strong> na {{portalName}} zatím není převzatý.</p><p><a href="{{claimUrl}}">Převzít a ověřit profil</a></p>',
    textContent: 'Převezměte profil firmy {{companyName}} na {{portalName}}.\n\n{{claimUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.company_claim_profile,
  },
  {
    key: 'company_new_review',
    name: 'Nová recenze firmy',
    category: 'company_directory',
    subject: 'Nová recenze na profilu {{companyName}}',
    htmlContent:
      '<p>Dobrý den,</p><p>na profilu vaší firmy <strong>{{companyName}}</strong> byla zveřejněna nová recenze ({{reviewRating}}/5).</p><p><em>{{reviewPreview}}</em></p><p><a href="{{reviewUrl}}">Zobrazit recenzi</a> · <a href="{{claimUrl}}">Převzít profil</a></p>',
    textContent:
      'Nová recenze na profilu {{companyName}} ({{reviewRating}}/5).\n\n{{reviewPreview}}\n\n{{reviewUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.company_new_review,
  },
  {
    key: 'company_data_review_request',
    name: 'Žádost o kontrolu údajů firmy',
    category: 'company_directory',
    subject: 'Žádost o kontrolu údajů – {{companyName}}',
    htmlContent:
      '<p>Dobrý den,</p><p>žádáme o kontrolu údajů profilu firmy <strong>{{companyName}}</strong> na {{portalName}}.</p><p>{{message}}</p><p><a href="{{companyUrl}}">Otevřít profil</a></p>',
    textContent: 'Žádost o kontrolu údajů firmy {{companyName}}.\n\n{{message}}\n\n{{companyUrl}}',
    variables: EMAIL_TEMPLATE_VARIABLES.company_data_review_request,
  },
  {
    key: 'company_report_response',
    name: 'Reakce na nahlášení profilu',
    category: 'company_directory',
    subject: 'Reakce na nahlášení – {{companyName}}',
    htmlContent:
      '<p>Dobrý den,</p><p>reakce na nahlášení profilu firmy <strong>{{companyName}}</strong>:</p><p>{{message}}</p>',
    textContent: 'Reakce na nahlášení profilu {{companyName}}:\n\n{{message}}',
    variables: EMAIL_TEMPLATE_VARIABLES.company_report_response,
  },
];

export function getTemplateVariables(key: string): string[] {
  return EMAIL_TEMPLATE_VARIABLES[key] ?? [];
}
