# Nastavení Facebook integrace (xxrealit)

Tento návod popisuje, jak připravit Meta (Facebook) aplikaci pro propojení Facebook stránek profesionálů s portálem xxrealit.

Po doplnění **tří povinných proměnných** v Railway funguje integrace bez dalších úprav kódu.

---

## 1. Vytvoření Meta App

1. Otevřete [Meta for Developers](https://developers.facebook.com/).
2. Přihlaste se účtem, který spravuje Facebook stránky vašich klientů.
3. Klikněte **My Apps → Create App**.
4. Zvolte typ **Business** (nebo **Other** → **Business** podle aktuálního průvodce Meta).
5. Zadejte název aplikace (např. `xxrealit`) a kontaktní e-mail.
6. Dokončete vytvoření aplikace.

---

## 2. Získání App ID a App Secret

1. V dashboardu aplikace otevřete **Settings → Basic**.
2. Zkopírujte **App ID** → proměnná `FACEBOOK_APP_ID`.
3. Zkopírujte **App Secret** (Show) → proměnná `FACEBOOK_APP_SECRET`.

> App Secret nikdy neukládejte do frontendu ani do gitu. Pouze do Railway Variables backend služby.

---

## 3. OAuth Redirect URI

1. V Meta App přejděte na **Facebook Login → Settings** (nebo **Use cases → Customize → Facebook Login**).
2. Do **Valid OAuth Redirect URIs** přidejte přesně:

```
https://VASE-API-DOMENA/api/social/facebook/callback
```

Produkční příklad (upravte podle skutečné API domény):

```
https://xxrealit.cz/api/social/facebook/callback
```

nebo pokud API běží na subdoméně:

```
https://api.xxrealit.cz/api/social/facebook/callback
```

3. Stejnou hodnotu nastavte v Railway jako `FACEBOOK_OAUTH_REDIRECT_URI`.

---

## 4. Oprávnění (Permissions)

V **App Review** nebo při konfiguraci produktu **Facebook Login** požádejte / přidejte:

- `pages_show_list`
- `pages_read_engagement`
- `pages_read_user_content`
- `pages_manage_metadata` (pro webhooky a metadata stránky)

V režimu vývoje mohou stránky spravované administrátory aplikace fungovat bez schválení review.

---

## 5. Webhook (volitelné — real-time sync)

1. V Meta App → **Webhooks** přidejte odběr pro **Page**.
2. **Callback URL**:

```
https://VASE-API-DOMENA/api/social/facebook/webhook
```

3. **Verify Token** — libovolný dlouhý řetězec; stejný uložte jako `FACEBOOK_WEBHOOK_VERIFY_TOKEN` v Railway.
4. Bez webhooku funguje automatický import přes cron (každých 12 minut).

---

## 6. Railway Variables (backend služba)

V projektu Railway u **NestJS backend** služby nastavte:

| Proměnná | Povinná | Příklad |
|----------|---------|---------|
| `FACEBOOK_APP_ID` | ano | `1234567890123456` |
| `FACEBOOK_APP_SECRET` | ano | `abc123...` |
| `FACEBOOK_OAUTH_REDIRECT_URI` | ano | `https://api.xxrealit.cz/api/social/facebook/callback` |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | doporučeno | náhodný řetězec 32+ znaků |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | pro webhook | náhodný řetězec |
| `API_PUBLIC_URL` | doporučeno | `https://api.xxrealit.cz` (pro zobrazení webhook URI v adminu) |
| `FRONTEND_URL` | ano pro redirect po OAuth | `https://www.xxrealit.cz` |

Šablona je v souboru `nestjs-backend/.env.example`.

Po uložení proměnných **restartujte** backend službu.

---

## 7. Ověření

1. V logu backendu po startu by mělo být:  
   `[Facebook] Integrace připravena. OAuth redirect: ...`
2. V administraci xxrealit: **Integrace → Facebook** — stav **Nakonfigurováno**.
3. Jako profesionál (makléř / firma): **Profil → Nastavení → Propojit Facebook stránku**.

---

## 8. Řešení problémů

| Problém | Řešení |
|---------|--------|
| „Facebook propojení není nakonfigurováno administrátorem.“ | Doplňte 3 povinné env proměnné a restartujte backend. |
| Redirect URI mismatch | URI v Meta App musí být **identické** s `FACEBOOK_OAUTH_REDIRECT_URI`. |
| Žádné stránky k výběru | Uživatel musí být adminem Facebook stránky; zkontrolujte oprávnění aplikace. |
| Token expired | Uživatel znovu klikne „Propojit Facebook stránku“. |

---

## Kontrolní endpoint

Veřejný stav konfigurace (bez tajných hodnot):

```
GET /api/social/facebook/config-status
```

Odpověď:

```json
{
  "configured": true,
  "missing": [],
  "oauthRedirectUri": "https://...",
  "webhookUri": "https://...",
  "recommendedMissing": []
}
```
