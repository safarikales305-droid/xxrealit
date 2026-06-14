# Nastavení Facebook integrace (xxrealit)

Portál používá **dvě oddělené Meta aplikace**:

| Aplikace | Účel | Env proměnné |
|----------|------|--------------|
| **Facebook Login** | Registrace a přihlášení uživatelů | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_CALLBACK_URL` |
| **Facebook Pages API** | Propojení stránky a import příspěvků | `FACEBOOK_PAGES_APP_ID`, `FACEBOOK_PAGES_APP_SECRET`, `FACEBOOK_PAGE_CONNECT_REDIRECT_URI` |

---

## 1. Facebook Pages aplikace (propojení stránky)

### Railway Variables

| Proměnná | Povinná | Příklad |
|----------|---------|---------|
| `FACEBOOK_PAGES_APP_ID` | ano | ID publikované Pages aplikace |
| `FACEBOOK_PAGES_APP_SECRET` | ano | App Secret z Meta konzole |
| `FACEBOOK_PAGE_CONNECT_REDIRECT_URI` | ano | `https://api.xxrealit.cz/api/social/facebook/page-callback` |
| `FACEBOOK_GRAPH_API_VERSION` | doporučeno | `v25.0` |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | doporučeno | náhodný řetězec 32+ znaků |

### OAuth Redirect URI v Meta App

```
https://VASE-API-DOMENA/api/social/facebook/page-callback
```

### Oprávnění (scopes)

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_metadata`
- `pages_manage_posts`

### Chování po propojení

1. OAuth přes **Pages App ID**
2. Načtení seznamu spravovaných stránek
3. Výběr stránky uživatelem
4. Uložení `pageId`, `pageName`, page access token
5. Synchronizace posledních 10 příspěvků (text, obrázky, videa)
6. Zobrazení v sekci Příspěvky

---

## 2. Facebook Login aplikace (registrace / přihlášení)

### Railway Variables

| Proměnná | Povinná |
|----------|---------|
| `FACEBOOK_APP_ID` | ano |
| `FACEBOOK_APP_SECRET` | ano |
| `FACEBOOK_CALLBACK_URL` | ano → `/api/social/facebook/callback` |

### Scopes

- `public_profile`
- `email`

Login **nepoužívá** Pages App ID. Tokeny z obou aplikací jsou uloženy odděleně.

---

## 3. Veřejné stránky (Meta App Review)

- Privacy Policy: `https://www.xxrealit.cz/privacy-policy`
- Terms: `https://www.xxrealit.cz/terms`

---

## 4. Ověření

```
GET /api/social/facebook/config-status
```

Očekávaná odpověď:

- `pagesConfigured: true` — propojení stránek funguje
- `configured: true` — Facebook Login funguje

---

## 5. Řešení problémů

| Problém | Řešení |
|---------|--------|
| Propojení stránky není nakonfigurováno | Doplňte `FACEBOOK_PAGES_APP_ID` a `FACEBOOK_PAGES_APP_SECRET` |
| Redirect URI mismatch (stránky) | URI v Pages Meta App = `FACEBOOK_PAGE_CONNECT_REDIRECT_URI` |
| Login nefunguje | Zkontrolujte `FACEBOOK_APP_ID` / `FACEBOOK_CALLBACK_URL` (jiná aplikace) |
| Žádné stránky k výběru | Uživatel musí být adminem FB stránky; ověřte pages scopes |

Šablona env: `nestjs-backend/.env.example`
