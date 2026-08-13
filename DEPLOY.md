# Deploying The Mindset Meditation

The app builds to a **self-contained Node server** (`output: 'standalone'`), so it
runs on Hostinger VPS, any Linux box, or Docker — no Vercel lock-in.

---

## 1. Requirements on the server

- **Node.js 20+** (`node -v`)
- **pnpm 9+** (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- A reverse proxy for TLS (Nginx / Caddy / Hostinger's panel)

> Hostinger shared hosting cannot run a Node server — you need a **VPS** or
> **Cloud** plan. Shared plans only serve PHP/static files.

---

## 2. Environment variables

All environment config lives in a **single `.env` at the repo root** — there is
deliberately none inside `apps/`. Copy `.env.example` to `.env` and fill it in.
The app reads four variables at runtime:

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public by design; RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server-only.** Never prefix `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | yes | **Your own domain**, not Supabase. `https://yourdomain.com`, no trailing slash. Drives canonical tags, sitemap and Open Graph — leave it as localhost and Google indexes the wrong host |
| `ADMIN_VERIFICATION_CODE` | yes | Second factor for `/admin`. Any text you choose. Fails closed if unset |
| `SUPABASE_DB_URL` | no | Raw Postgres connection. **Nothing in the project requires it** — kept only if you want to run SQL from a terminal instead of the dashboard |
| `R2_*` (four) | no | Leave blank to store audio in Supabase Storage; fill all four for Cloudflare R2 (see 2b) |

### Why two Supabase URLs?

They are different protocols with different credentials, which is why one
cannot replace the other:

| | Protocol | Secret | Used by |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://` REST / Auth / Storage | API keys | the app, every request |
| `SUPABASE_DB_URL` | `postgresql://` raw SQL | database password | optional; terminal SQL only |

Nothing in the project opens a Postgres connection any more — the app and
`pnpm seed:admin` both go through the HTTPS API. **Only the first is needed.**
`SUPABASE_DB_URL` is now purely optional convenience.

---

## 2b. Cloudflare R2 for audio (optional)

Leave the four `R2_*` values blank and audio is stored in the private
`podcast-audio` Supabase bucket — that works with no setup at all. Use R2 when
you want cheaper storage and no egress fees.

Only the object key is ever written to the database; playback always goes
through a short-lived signed URL, so the bucket stays private.

**1. Create the bucket**
- Cloudflare dashboard → **R2 Object Storage** → **Create bucket**
- Name it, e.g. `mindset-meditation-audio` → **Create**
- Leave it **private**. Do not enable public access — the app signs URLs itself.
- → this name is `R2_BUCKET`

**2. Get the Account ID**
- Still in **R2 Object Storage**, the **Account ID** is shown on the right of the
  overview page (it is also the long hex string in the dashboard URL).
- → `R2_ACCOUNT_ID`

**3. Create an API token**
- R2 → **Manage R2 API Tokens** → **Create API Token**
- Permission: **Object Read & Write**
- Scope it to the single bucket you just made, not "all buckets"
- Create, then copy both values from the result screen:
  - **Access Key ID** → `R2_ACCESS_KEY_ID`
  - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
- The secret is shown **once**. If you lose it, delete the token and make another.

**4. Allow browser uploads (CORS)**
Uploads go straight from the admin's browser to R2, so the bucket must accept
them. Bucket → **Settings** → **CORS policy** → add:

```json
[
  {
    "AllowedOrigins": [
      "https://themindsetmeditation.com",
      "https://www.themindsetmeditation.com",
      "http://localhost:3100"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

List **every** origin the admin page is served from, scheme included and no
trailing slash — R2 matches the browser's `Origin` header exactly, so a policy
naming the apex domain does nothing for `www.`. Without a match the browser
reports *"Network error during upload — check the storage bucket CORS
settings"*, and the console shows the preflight failing with *No
'Access-Control-Allow-Origin' header is present*.

**5. Fill in `.env` and restart**

```bash
R2_ACCOUNT_ID=...
R2_BUCKET=mindset-meditation-audio
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
```

All four must be set — a partial set counts as "not configured". Restart, then
open `/admin/upload`: the banner at the top states which backend is live, so you
get immediate confirmation. Existing Supabase-stored episodes keep playing;
`audio_path` records its backend per row (`sb:` / `r2:`).

---

## 3. Build and run

```bash
pnpm install --frozen-lockfile
pnpm --filter @mindset/web build
```

`next build` emits `apps/web/.next/standalone`. Three things must sit next to the
server before it will run — Next does not copy them for you:

```bash
# run these from the repo root — the paths matter
cp -R apps/web/public       apps/web/.next/standalone/apps/web/public
cp -R apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static
cp .env                     apps/web/.next/standalone/apps/web/.env

cd apps/web/.next/standalone/apps/web
PORT=3100 HOSTNAME=127.0.0.1 node server.js
```

> **The `.env` copy is not optional.** `next.config.ts` reads the root `.env` at
> *build* time, which is enough to inline `NEXT_PUBLIC_*` into the client
> bundle — but the standalone server is a separate process that never evaluates
> `next.config.ts`. Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`,
> `ADMIN_VERIFICATION_CODE`) must reach it as real environment variables or as a
> `.env` sitting next to `server.js`. Miss this and the public site looks fine
> while every admin page returns **500**.
>
> With systemd, `EnvironmentFile=` covers this and no copy is needed.

Bind to `127.0.0.1` and let the reverse proxy terminate TLS — do not expose the
Node port directly.

### Keep it running (systemd)

```ini
# /etc/systemd/system/mindset.service
[Unit]
Description=The Mindset Meditation
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/mindset/apps/web/.next/standalone/apps/web
ExecStart=/usr/bin/node server.js
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=HOSTNAME=127.0.0.1
EnvironmentFile=/var/www/mindset/.env.production
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now mindset
```

### Nginx

```nginx
server {
  server_name yourdomain.com;
  client_max_body_size 210M;   # audio uploads go direct to storage, but be safe

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cache_bypass $http_upgrade;
  }
}
```

Do **not** add security headers in Nginx — `next.config.ts` already sends CSP,
HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and
`Permissions-Policy`. Duplicating them causes conflicts.

---

## 4. Database

The whole database is defined by **`fullschema.sql`** in the repo root. There
are no incremental migration files — that one file is the source of truth.

**Set up a database:**
1. Supabase Dashboard → **SQL Editor** → paste all of `fullschema.sql` → **Run**
   (or `psql "$SUPABASE_DB_URL" -f fullschema.sql`)
2. Check **Settings → API → Exposed schemas** lists `podcast` — the script sets
   this automatically, but some projects restrict `ALTER ROLE`
3. Create the first admin:
   ```bash
   pnpm seed:admin -- --email you@example.com --password 'a-strong-password'
   ```

It creates the schema, all 9 tables, indexes, functions, triggers, row-level
security, the storage buckets and their policies, and the seed categories.

**Changing the schema later:** edit the database directly (dashboard SQL Editor),
then regenerate `fullschema.sql` so it stays in step. On a database that already
holds data, write the `ALTER` statements yourself — re-running `fullschema.sql`
will not migrate existing tables, and uncommenting its `DROP SCHEMA` line
destroys data.

`db.<project-ref>.supabase.co` resolves over **IPv6 only**. On an IPv4-only
network use the pooler instead:

```
SUPABASE_DB_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

---

## 5. Pre-launch checklist

- [ ] `NEXT_PUBLIC_APP_URL` is the real domain (drives canonicals, sitemap, OG)
- [ ] Rotate `ADMIN_PASSWORD` off the default and rotate the Postgres password
- [ ] Confirm `.env*` files are gitignored (they are) and never committed
- [ ] `fullschema.sql` has been run and `podcast` is in Settings → API → Exposed schemas
- [ ] Supabase → Auth → set **Site URL** and **Redirect URLs** to your domain,
      or email confirmation links will point at localhost
- [ ] Decide on email confirmation (Auth → Sign In / Providers → "Confirm email")
- [ ] TLS certificate installed; HSTS is already sent with a 2-year max-age
- [ ] Submit `https://yourdomain.com/sitemap.xml` to Google Search Console

### Admin sign-in has two steps

1. Email/username + password (Supabase Auth).
2. `ADMIN_VERIFICATION_CODE` — entered at `/auth/verify`, compared on the server
   in constant time and never sent to the browser. Proof is kept in a signed,
   HttpOnly cookie bound to that user id, valid 12 hours.

Changing the code immediately invalidates every admin session. There is no
password-only path to `/admin`: with the code unset, admin access fails closed.

### Roles

Role assignment is deliberately **not** possible through the app. `role` on
`podcast.profiles` has column-level `UPDATE` revoked from `authenticated`/`anon`
plus a trigger guard (migration 023), so a signed-in user cannot promote
themselves. Grant admin via `pnpm seed:admin` or the Supabase SQL editor:

```sql
UPDATE podcast.profiles SET role = 'admin' WHERE email = 'you@example.com';
```
