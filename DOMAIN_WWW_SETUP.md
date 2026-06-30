# Doména XXREALIT — www jako hlavní

Hlavní produkční doména portálu je **`https://www.xxrealit.cz`**.

## Chování redirectů (aplikace)

| Požadavek | Odpověď |
|-----------|---------|
| `https://www.xxrealit.cz` | **200** (bez redirectu) |
| `https://www.xxrealit.cz/...` | **200** |
| `http://www.xxrealit.cz` | **301** → `https://www.xxrealit.cz/...` |
| `https://xxrealit.cz` | **301** → `https://www.xxrealit.cz/...` |
| `http://xxrealit.cz` | **301** → `https://www.xxrealit.cz/...` |

Redirecty jsou implementovány v:

- `zdroj/middleware.ts` — apex / http → `https://www.xxrealit.cz` (301, zachová cestu i query)
- `zdroj/next.config.js` — záložní redirect pro host `xxrealit.cz`

## Railway — co nastavit

### 1. Custom domains (služba Next.js / frontend)

1. Railway → služba **frontend (zdroj)** → **Settings → Networking → Public Networking**
2. Přidejte obě domény:
   - `www.xxrealit.cz` — **primární / hlavní**
   - `xxrealit.cz` — sekundární (apex)
3. **Nepoužívejte** v Railway volbu „redirect www to root domain“ ani „canonical domain = apex“.
4. Primární doména služby musí být **`www.xxrealit.cz`**.

### 2. DNS u registrátora

| Záznam | Typ | Hodnota |
|--------|-----|---------|
| `www` | CNAME | Railway CNAME pro frontend službu |
| `@` (apex) | A / ALIAS / ANAME | Railway apex target **nebo** CNAME flattening |

Apex `xxrealit.cz` musí směřovat na stejnou Next.js službu — aplikace pak sama vrátí **301** na www.

### 3. Proměnné prostředí (frontend + backend)

```
FRONTEND_URL=https://www.xxrealit.cz
NEXT_PUBLIC_SITE_URL=https://www.xxrealit.cz
NEXT_PUBLIC_APP_URL=https://www.xxrealit.cz
```

**Nepoužívejte** `https://xxrealit.cz` jako hlavní URL v env.

Backend (NestJS) navíc:

```
CORS_ORIGINS=https://www.xxrealit.cz,https://xxrealit.cz
```

### 4. Ověření po deployi

```bash
curl -I https://www.xxrealit.cz
# HTTP/2 200

curl -I https://www.xxrealit.cz/tiktoknof0yrLRtCYD00IURAqBcHvJQWXdclaF.txt
# HTTP/2 200

curl -I https://xxrealit.cz/inzerat/123
# HTTP/2 301
# location: https://www.xxrealit.cz/inzerat/123
```

## TikTok Domain Verification

Soubor je dostupný na:

`https://www.xxrealit.cz/tiktoknof0yrLRtCYD00IURAqBcHvJQWXdclaF.txt`

- Statická kopie: `zdroj/public/tiktoknof0yrLRtCYD00IURAqBcHvJQWXdclaF.txt`
- Alternativa: nahrát přes **Administrace → Nastavení → Ověřovací soubory**

Ověřovací soubory na www **nejsou** přesměrovávány na apex.
