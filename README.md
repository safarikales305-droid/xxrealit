# XXrealit — monorepo

- **`zdroj/`** — Next.js frontend (set **Root Directory** to `zdroj` on Vercel)
- **`nestjs-backend/`** — NestJS API (deploy separately, e.g. Railway / VPS)

Local frontend:

```bash
cd zdroj
npm install
npm run dev
```

### Vercel (avoid 404 on `/`)

1. **Root Directory:** `zdroj` (exact folder name; must contain `package.json` + `src/app/page.tsx`).
2. **Framework preset:** Next.js (auto-detected from dependencies).
3. Do **not** set a custom **Output Directory** for Next.js leave default empty).
4. **Environment:** set `NEXT_PUBLIC_API_URL` to your deployed API (not `localhost`).
5. Redeploy after changing Root Directory.

---
