# Nastavení Facebook integrace (xxrealit)

Tento návod popisuje, jak připravit Meta (Facebook) aplikaci pro propojení Facebook stránek profesionálů s portálem xxrealit přes **Facebook Pages API**.

Po doplnění **povinných proměnných** v Railway funguje integrace bez dalších úprav kódu.

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
https://VASE-API-DOMENA/api/social/facebook/page-callback
```

Produkční příklad (upravte podle skutečné API domény):

```
https://api.xxrealit.cz/api/social/facebook/callback
https://api.xxrealit.cz/api/social/facebook/page-callback
```

3. Stejnou hodnotu nastavte v Railway jako `FACEBOOK_CALLBACK_URL` (nebo `FACEBOOK_OAUTH_REDIRECT_URI`).
4. Pro výběr stránky nastavte `FACEBOOK_PAGE_CONNECT_REDIRECT_URI` na `/api/social/facebook/page-callback`.

---

## 4. Oprávnění (Permissions) — Facebook Pages API

V **App Review** nebo při konfiguraci produktu **Facebook Login** požádejte / přidejte:

- `pages_show_list` — výběr spravovaných stránek
- `pages_read_engagement` — čtení příspěvků a engagement
- `pages_manage_metadata` — metadata stránky
- `pages_manage_posts` — správa příspěvků stránky

V režimu vývoje mohou stránky spravované administrátory aplikace fungovat bez schválení review.

---

## 5. Webhook (volitelné — real-time sync)

1. V Meta App → **Webhooks** přidejte odběr pro **Page**.
2. **Callback URL**:

```
https://VASE-API-DOMENA/api/social/facebook/webhook
```

3. **Verify Token** — libovolný dlouhý řetězec; stejný uložte jako `FACEBOOK_WEBHOOK_VERIFY_TOKEN` v Railway.
4. Bez webhooku funguje automatický import přes cron (každých **30 minut**).

---

## 6. Railway Variables (backend služba)

V projektu Railway u **NestJS backend** služby nastavte:

| Proměnná | Povinná | Příklad |
|----------|---------|---------|
| `FACEBOOK_APP_ID` | ano | `940467065697861` |
| `FACEBOOK_APP_SECRET` | ano | `abc123...` |
| `FACEBOOK_CALLBACK_URL` | ano | `https://api.xxrealit.cz/api/social/facebook/callback` |
| `FACEBOOK_PAGE_CONNECT_REDIRECT_URI` | doporučeno | `https://api.xxrealit.cz/api/social/facebook/page-callback` |
| `FACEBOOK_GRAPH_API_VERSION` | doporučeno | `v25.0` |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | doporučeno | náhodný řetězec 32+ znaků |
| `FACEBOOK_WEBHOOK_VERIFY_TOKEN` | pro webhook | náhodný řetězec |
| `API_PUBLIC_URL` | doporučeno | `https://api.xxrealit.cz` (pro zobrazení webhook URI v adminu) |
| `FRONTEND_URL` | ano pro redirect po OAuth | `https://www.xxrealit.cz` |

Alternativa k `FACEBOOK_CALLBACK_URL` je `FACEBOOK_OAUTH_REDIRECT_URI` se stejnou hodnotou.

Šablona je v souboru `nestjs-backend/.env.example`.

Po uložení proměnných **restartujte** backend službu.

---

## 7. Chování po propojení stránky

Po OAuth a výběru stránky backend:

1. Uloží `pageId` a šifrovaný page access token.
2. Načte posledních **10** příspěvků přes Graph API (`/{pageId}/posts`).
3. Importuje text, obrázky, videa a datum publikace.
4. Přiřadí příspěvky uživateli, který stránku připojil.
5. Nastaví `facebookUrl` pro případný fallback import.

Pokud Meta Graph API není dostupné, backend automaticky zkusí **URL import** (scraping veřejné stránky).

---

## 8. Ověření

1. V logu backendu po startu by mělo být:  
   `[Facebook] Integrace připravena. OAuth redirect: ...`
2. V administraci xxrealit: **Integrace → Facebook** — stav **Nakonfigurováno**.
3. Jako profesionál (makléř / firma): **Profil → Nastavení → Propojit Facebook stránku**.

---

## 9. Řešení problémů

| Problém | Řešení |
|---------|--------|
| „Facebook propojení není nakonfigurováno administrátorem.“ | Doplňte povinné env proměnné a restartujte backend. |
| Redirect URI mismatch | URI v Meta App musí být **identické** s `FACEBOOK_CALLBACK_URL`. |
| Žádné stránky k výběru | Uživatel musí být adminem Facebook stránky; zkontrolujte pages scope v Meta App Review. |
| Token expired | Uživatel znovu klikne „Propojit Facebook stránku“. |
| Graph API selhává | Zkontrolujte log `FACEBOOK_PAGE_URL_FALLBACK` — použije se URL import. |

---

## Kontrolní endpoint

Veřejný stav konfigurace (bez tajných hodnot):

```
GET /api/social/facebook/config-status
```
