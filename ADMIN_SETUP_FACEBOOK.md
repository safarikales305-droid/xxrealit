# Nastavení Facebook integrace (xxrealit)

Portál používá **dvě oddělené Meta aplikace**. OAuth redirect URI se **generují z `FRONTEND_URL`** (Next.js proxy na Nest backend).

| Callback | URL |
|----------|-----|
| Facebook Login | `{FRONTEND_URL}/api/social/facebook/callback` |
| Facebook Pages | `{FRONTEND_URL}/api/social/facebook/page-callback` |

Příklad pro produkci (`FRONTEND_URL=https://www.xxrealit.cz`):

```
https://www.xxrealit.cz/api/social/facebook/callback
https://www.xxrealit.cz/api/social/facebook/page-callback
```

> **Důležité:** V Railway **nesmí** být nastavené `FACEBOOK_CALLBACK_URL` ani `FACEBOOK_PAGE_CONNECT_REDIRECT_URI` na starou Railway doménu — jinak přepíší odvozené URI. Použijte jen `FRONTEND_URL`.

---

## Railway Variables (backend)

| Proměnná | Povinná |
|----------|---------|
| `FRONTEND_URL` | ano → `https://www.xxrealit.cz` |
| `FACEBOOK_APP_ID` | ano (Login aplikace) |
| `FACEBOOK_APP_SECRET` | ano (Login aplikace) |
| `FACEBOOK_PAGES_APP_ID` | ano (Pages aplikace) |
| `FACEBOOK_PAGES_APP_SECRET` | ano (Pages aplikace) |
| `FACEBOOK_GRAPH_API_VERSION` | doporučeno → `v25.0` |

Railway Variables (frontend): stejné `FRONTEND_URL`, plus `API_URL` / `NEXT_PUBLIC_API_URL` na interní Nest službu.

---

## Meta App — Valid OAuth Redirect URIs

Do **obou** Meta aplikací (Login i Pages) přidejte příslušné URI z tabulky výše.

---

## Ověření

```
GET /api/social/facebook/config-status
```

`pageConnectRedirectUri` musí být `https://www.xxrealit.cz/api/social/facebook/page-callback`.

Šablona: `nestjs-backend/.env.example`
