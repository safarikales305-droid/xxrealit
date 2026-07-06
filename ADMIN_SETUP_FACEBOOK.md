# Nastavení Facebook integrace (xxrealit)

Portál používá **dvě oddělené Meta aplikace** (Login + Pages). Všechny OAuth toky sdílejí **jediný callback**:

| Callback | URL |
|----------|-----|
| Meta / Facebook OAuth (vše) | `{FRONTEND_URL}/api/social/facebook/meta-connect-callback` |

Příklad pro produkci (`FRONTEND_URL=https://www.xxrealit.cz`):

```
https://www.xxrealit.cz/api/social/facebook/meta-connect-callback
```

Starší cesty (`/api/social/facebook/callback`, `/api/auth/facebook/callback`, `/api/social/facebook/page-callback`) vrací **301** na kanonický callback.

> **Důležité:** V Railway nastavte `META_REDIRECT_URI` na veřejnou doménu. Nepoužívejte Railway URL (`*.railway.app`) v Meta Developers.

---

## Railway Variables (backend)

| Proměnná | Povinná |
|----------|---------|
| `FRONTEND_URL` | ano → `https://www.xxrealit.cz` |
| `META_REDIRECT_URI` | ano → `https://www.xxrealit.cz/api/social/facebook/meta-connect-callback` |
| `FACEBOOK_APP_ID` | ano (Login aplikace) |
| `FACEBOOK_APP_SECRET` | ano (Login aplikace) |
| `FACEBOOK_PAGES_APP_ID` | ano (Pages aplikace) |
| `FACEBOOK_PAGES_APP_SECRET` | ano (Pages aplikace) |
| `FACEBOOK_GRAPH_API_VERSION` | doporučeno → `v25.0` |

Railway Variables (frontend): stejné `FRONTEND_URL`, plus `API_URL` / `NEXT_PUBLIC_API_URL` na interní Nest službu.

---

## Meta App — Valid OAuth Redirect URIs

Do **obou** Meta aplikací (Login i Pages) přidejte:

```
https://www.xxrealit.cz/api/social/facebook/meta-connect-callback
```

---

## Ověření

```
GET /api/social/facebook/config-status
```

`oauthRedirectUri`, `pageConnectRedirectUri` a `metaConnectRedirectUri` musí být stejné:
`https://www.xxrealit.cz/api/social/facebook/meta-connect-callback`.

Šablona: `nestjs-backend/.env.example`
