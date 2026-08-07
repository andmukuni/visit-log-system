# Deploy Visit Log System on Coolify

## Quick checklist

1. **Repository:** `andmukuni/visit-log-system` branch `main`
2. **Build pack:** Docker Compose → `docker-compose.yml` → service **`node-template`**
3. **Container port:** `4000`
4. **Health check:** `/api/health`
5. **Domain:** e.g. `https://visitors.wgzm.net`
6. **PostgreSQL:** separate Coolify database on **the same server** (`big-server-1`), **linked to this app**

---

## Step 1 — PostgreSQL on Coolify

1. Coolify → **+ New** → **Database** → **PostgreSQL** (same server as the app)
2. Wait until status is **Running**
3. Open the PostgreSQL resource → copy **Internal** connection URL (not public IP)

Example internal URL shape:

```text
postgres://postgres:PASSWORD@INTERNAL_HOST:5432/postgres
```

---

## Step 2 — Link database to the app (fixes `EAI_AGAIN`)

`getaddrinfo EAI_AGAIN <hostname>` means the app container **cannot resolve** the Postgres hostname on Docker DNS. This happens when the app is **not on the same network** as the database.

**Do this:**

1. Open your **Visit Log System** application in Coolify
2. **Configuration** → find **Connected resources** / **Database** / **Link database** (wording varies by Coolify version)
3. **Connect** the PostgreSQL database you created on `big-server-1`
4. Coolify may inject `DATABASE_URL` automatically — if so, **remove any old manual `DATABASE_URL`** with a stale hostname
5. If you set `DATABASE_URL` manually, paste the **current internal URL** from the Postgres resource (hostnames change when DB is recreated)

> Both app and Postgres must run on **the same Coolify server**. An internal hostname like `u1ojire68b3oyhjj6x1sgxo8` only resolves inside that server's Docker network.

---

## Step 3 — Environment variables (Coolify UI)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Internal Postgres URL (from linked DB or Postgres resource) |
| `AUTH_TOKEN_SECRET` | Long random hex string |
| `APP_URL` | `https://visitors.wgzm.net` (no trailing slash) |
| `CORS_ORIGINS` | Same as `APP_URL` |
| `TRUST_PROXY` | `1` |
| `DEFAULT_ADMIN_EMAIL` | First admin login |
| `DEFAULT_ADMIN_PASSWORD` | Strong password (required on first boot) |

### NODE_ENV

Set **`NODE_ENV` as Runtime only** — uncheck **Available at Buildtime**.

---

## Port binding

`docker-compose.yml` uses **`expose: 4000`** only (no host `4000:4000`). Coolify's proxy routes to the container internally.

---

## Restart loop troubleshooting

| Log message | Fix |
|---|---|
| `getaddrinfo EAI_AGAIN <host>` | Link Postgres to app; refresh internal `DATABASE_URL` |
| `Bind for 0.0.0.0:4000 failed` | Redeploy latest compose (no host port bind) |
| `AUTH_TOKEN_SECRET must be set` | Add `AUTH_TOKEN_SECRET` in Coolify env |
| `DEFAULT_ADMIN_PASSWORD are required` | Set strong `DEFAULT_ADMIN_PASSWORD` |

The app waits up to ~60s for the database on startup before exiting.

---

## Verify after deploy

```text
GET https://visitors.wgzm.net/api/health   → { "ok": true }
GET https://visitors.wgzm.net/api/db-test  → { "ok": true, "driver": "postgres" }
```

Admin login: `/admin/login`
