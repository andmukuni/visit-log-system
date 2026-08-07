# Deploy Visit Log System on Coolify

## Quick checklist

1. **Repository:** `andmukuni/visit-log-system` branch `main`
2. **Build pack:** Dockerfile / Docker Compose
3. **Container port:** `4000` (set in Coolify → Configuration → Ports)
4. **Health check:** `/api/health`
5. **Domain:** e.g. `https://visitors.wgzm.net`

## Environment variables (Coolify UI)

Copy from `.env.coolify.example`. Required:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL internal URL from Coolify |
| `AUTH_TOKEN_SECRET` | Long random string |
| `APP_URL` | Public URL, no trailing slash |
| `CORS_ORIGINS` | Same as `APP_URL` |
| `TRUST_PROXY` | `1` |
| `DEFAULT_ADMIN_EMAIL` | First admin login |
| `DEFAULT_ADMIN_PASSWORD` | Strong password |

### NODE_ENV — important

Set **`NODE_ENV` as Runtime only** (uncheck “Available at Buildtime”).

If `NODE_ENV=production` is injected at **build time**, npm skips devDependencies and the Vite build can fail.

The Dockerfile build stage uses `NODE_ENV=development` internally, but Coolify build-args can override this if the variable is marked build-time.

## Port conflict fix

`docker-compose.yml` uses **`expose: 4000`** only — no `ports:` mapping.

Coolify’s proxy connects to the container on port 4000. Do **not** publish `4000:4000` on the host; another app may already use host port 4000.

## Persistent uploads

Mount volume `/app/uploads` in Coolify if you need uploaded files to survive redeploys.

## Verify after deploy

```text
GET https://your-domain/api/health        → { "ok": true }
GET https://your-domain/api/db-test         → { "ok": true, "driver": "postgres" }
```

Admin login: `/admin/login`
