# The Mindset Meditation — setup, run & test

A meditation **podcast** web app. One Next.js app (`apps/web`) → **Supabase** (auth + Postgres,
isolated in a dedicated `podcast` schema) and **Cloudflare R2** (podcast audio). Runs at
**http://localhost:3100** (port 3000 is used by another app).

## Where things live (the "data cloud")
- **Supabase** — auth (login/signup) + all metadata (podcasts, categories, comments, saves) +
  cover images. Already connected in this project.
- **Cloudflare R2** — the MP3 audio (streamed via short-lived signed URLs). You enable this (below).

---

## Enable the cloud — step by step

### Supabase (already enabled)
Nothing to do — it's wired up (URL + keys in the root `.env`). To re-apply from
scratch: `pnpm install, run fullschema.sql, then pnpm seed:admin`.

### Cloudflare R2 (you enable this for audio)
1. Cloudflare dashboard → **R2** → *Create bucket* → name it **`mindset-meditation-audio`** (keep it **private**).
2. R2 → *Manage R2 API Tokens* → *Create API token* → **Object Read & Write** → Create.
   Copy **Access Key ID** + **Secret Access Key**, and note your **Account ID**.
3. Bucket → **Settings → CORS Policy → Add**:
   ```json
   [{ "AllowedOrigins": ["http://localhost:3100"], "AllowedMethods": ["PUT","GET"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
4. Fill the root `.env`:
   ```
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<access key id>
   R2_SECRET_ACCESS_KEY=<secret>
   R2_BUCKET=mindset-meditation-audio
   ```
5. Restart: `lsof -ti tcp:3100 | xargs kill -9; pnpm --filter @mindset/web dev`

---

## Is it free or paid?

**For testing and a small app: everything is free.** You only pay if you outgrow the free tiers.

| Service | Free tier (plenty for testing) | If you outgrow it |
|---|---|---|
| **Cloudflare R2** (audio) | 10 GB storage, 1M writes + 10M reads / month, **$0 egress ever** | ~$0.015 / GB-month over 10 GB; egress stays free |
| **Supabase** (db + auth) | 500 MB DB, 1 GB file storage, 2 GB egress, 50k monthly users | Pro plan ~$25/month for more |
| **Hosting** (e.g. Vercel) | Hobby tier free for personal projects | Paid when you scale/commercialize |

R2's zero egress fee is exactly why it's a good fit for streaming audio. **Start free; pay nothing
until you have real traffic or a large library.**

---

## Run
```bash
pnpm --filter @mindset/web dev      # http://localhost:3100
```
Production build: `pnpm --filter @mindset/web build && pnpm --filter @mindset/web start`.

## Test the flow (step by step)
1. Create an admin if you have not already — credentials are passed in, never
   stored in `.env`:
   ```bash
   pnpm seed:admin -- --email you@example.com --password 'a-strong-password'
   ```
   Then open **http://localhost:3100/auth/login**, sign in, and enter the
   `ADMIN_VERIFICATION_CODE` from `.env` when prompted. Admin sign-in is two
   steps: password, then that code.
2. Click **Upload** (top-right, admins only) → fill **Title, Channel, Description, Category**, choose
   an **MP3** (cover optional) → **Publish**.
3. Go **Home** → your session appears → open it → **Play**. Free listeners get a **1-minute preview**;
   after 60s a lock message shows.
4. **Save** it (heart, no downloads) and **comment**. Manage/delete everything at **`/admin/podcasts`**.

## Notes
- Signups may need email confirmation (Supabase → Authentication → Providers → Email → turn off
  "Confirm email" for instant testing). The admin account is already confirmed.
- The old `apps/admin` / `apps/api` apps are retired (excluded from the workspace).
