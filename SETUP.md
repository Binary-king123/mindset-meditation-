# The Mindset Meditation — setup, run & test

A meditation **podcast** web app. One Next.js app (`apps/web`) → **Supabase** (auth + Postgres,
isolated in a dedicated `podcast` schema) and **Cloudflare R2** (podcast audio). Runs at
**http://localhost:3100** (port 3000 is used by another app).

## Where things live (the "data cloud")
- **Supabase** — auth (login/signup) + all metadata (episodes, playlists, comments, saves) +
  cover images. Already connected in this project.
- **Cloudflare R2** — the MP3 audio (streamed via short-lived signed URLs). You enable this (below).

---

## Enable the cloud — step by step

### Supabase (already enabled)
Nothing to do — it's wired up (URL + keys in the root `.env`).

**Database changes.** One path: `fullschema.sql` is the source of truth.

| Situation | Run |
|---|---|
| Brand-new project | Paste `fullschema.sql` into the Supabase SQL Editor, then `pnpm seed:admin` |
| Changing the schema | Edit `fullschema.sql`, paste it into the SQL Editor again |
| Not sure what state you are in | Re-run `fullschema.sql` — it converges to the current schema |

Re-running is safe on a live database. Every statement is idempotent (`IF NOT EXISTS`,
`DROP … IF EXISTS` before each `CREATE`, `ON CONFLICT DO NOTHING` on seeds), so it never drops a
table the current schema still defines and no row of real data is lost.

When you change a column, change `packages/types/src/index.ts` to match — it mirrors the schema,
and drift there is invisible until it breaks at runtime.

Prefer psql? `psql "$SUPABASE_DB_URL" -f fullschema.sql`, with the **Session pooler** URI
(port 5432) from **Project Settings → Database → Connection string → URI**. The transaction pooler
on 6543 rejects DDL.

### Cloudflare R2 (you enable this for audio)
1. Cloudflare dashboard → **R2** → *Create bucket* → name it **`mindset-meditation-audio`** (keep it **private**).
2. R2 → *Manage R2 API Tokens* → *Create API token* → **Object Read & Write** → Create.
   Copy **Access Key ID** + **Secret Access Key**, and note your **Account ID**.
3. Bucket → **Settings → CORS Policy → Add**:
   ```json
   [{
     "AllowedOrigins": ["http://localhost:3100", "https://your-domain.com"],
     "AllowedMethods": ["PUT", "GET"],
     "AllowedHeaders": ["*"],
     "MaxAgeSeconds": 3600
   }]
   ```
   > `ExposeHeaders` is deliberately not needed. Files over 8 MB upload in
   > parallel chunks, and S3 reassembles them from a manifest of per-chunk
   > ETags — but the server asks R2 for that manifest itself (`ListParts`)
   > rather than trusting the browser, so a bucket that hides the `ETag`
   > response header still uploads fine.
4. Fill the root `.env`:
   ```
   R2_ACCOUNT_ID=<account id>
   R2_ACCESS_KEY_ID=<access key id>
   R2_SECRET_ACCESS_KEY=<secret>
   R2_BUCKET=mindset-meditation-audio
   ```
5. Restart: `lsof -ti tcp:3100 | xargs kill -9; pnpm --filter @mindset/web dev`

### Email / SMTP (required for password reset)

**Why no email arrives by default:** Supabase's built-in email sender only delivers to addresses
that belong to your own project team, and it is capped at roughly two messages an hour. A real
user asking for a password reset never receives anything.

So this app does not use it. It generates the recovery link itself with the service role and sends
it over **your own SMTP** — configured entirely in `.env`, with nothing to set up in the Supabase
dashboard.

**1. Get SMTP credentials.** Any provider works. Free tiers that are plenty for this:

| Provider | Free tier | Host | Port | Username |
|---|---|---|---|---|
| **Resend** (easiest) | 3,000 emails/mo | `smtp.resend.com` | 587 | `resend` (password = your API key) |
| **Brevo** | 300/day | `smtp-relay.brevo.com` | 587 | your Brevo login |
| **Mailgun** | 100/day | `smtp.mailgun.org` | 587 | `postmaster@<your-domain>` |
| **Gmail** | ~500/day | `smtp.gmail.com` | 587 | your address + an [App Password](https://myaccount.google.com/apppasswords), **not** your normal password |

**2. Put them in the root `.env`:**

```dotenv
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxx
SMTP_FROM="The Mindset Meditation <noreply@your-domain.com>"
```

> **`SMTP_FROM` is required — this is the one people get wrong.** It must be a real address your
> provider has verified. Leaving it blank does *not* fall back to something sensible: with Resend,
> `SMTP_USER` is the literal word `resend`, and sending from that is rejected with
> **`550 Invalid \`from\` field`**.
>
> With Resend you can send from `onboarding@resend.dev` before verifying a domain — but an
> unverified sender can only deliver to your own Resend account address, so verify your domain
> before real users rely on it.

- `SMTP_SECURE` is worked out automatically — `true` on port 465, `false` on 587/25 (which start
  plaintext and upgrade with STARTTLS). Only set it explicitly if your provider is unusual.
  Getting this wrong is the classic cause of a send that hangs and then times out.

**3. Check it before touching the app:**

```bash
pnpm smtp:test -- --to you@example.com
```

This prints the full SMTP conversation and, on failure, names the exact setting to change. Much
faster than guessing from the web form.

**4. Restart the app** — env vars are read at boot.

**5. Test the real flow:** `/auth/login` → *Forgot password?* → your email → open the link → set a
new password.

If SMTP is missing or the server rejects the message, the form now says so explicitly instead of
claiming success, and the underlying error is logged to the server console. A genuinely unknown
email address still shows the neutral "check your inbox" message, so the form cannot be used to
discover which addresses have accounts.

Good to know about the link itself:
- It expires in **1 hour** and works **once**.
- It can be opened on **any device or browser** — the link carries a one-time token rather than a
  PKCE code, so requesting it on your phone and opening it on your laptop works fine.

> Supabase's dashboard SMTP settings and Redirect URLs are **not** needed for password reset. They
> only matter if you also want branded **signup confirmation** emails, which still go through
> Supabase (Authentication → Emails → SMTP Settings).

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
2. **`/admin/links`** — paste the show URL for each app you are on (Spotify, Apple Podcasts,
   Amazon Music, YouTube Music, Pocket Casts, JioSaavn, Gaana, Castbox, Overcast). Buttons only
   appear for apps you fill in.
3. **`/admin/playlists` → New playlist** — give it a **name**, **description** and **cover art**.
   Playlists are the only grouping: this is how listeners browse.
   > The **newest playlist's cover doubles as the homepage artwork**, so there is only ever one
   > place to upload it.
4. Click **Upload** → fill **Title, Channel, Description**, pick the **playlist**, choose an
   **MP3**, and optionally paste this episode's own URL under **Links for this episode** →
   **Publish**.
5. Go **Home** → the playlist appears under *Browse the series*; click it to see the episodes
   inside. Open one → **Play**. Free listeners get a **1-minute preview**; after 60s a lock
   message shows. The app symbols under the audio use this episode's links, falling back to the
   show-wide ones from step 2.
6. **Save** it (heart, no downloads) and **comment**. Manage/delete episodes and
   playlists at **`/admin/playlists`**, platform links at **`/admin/links`**.
7. Test password reset: **`/auth/login` → Forgot password?** → enter your email → open the emailed
   link → set a new password.

## Notes
- **Signup needs no email verification.** Accounts are created with the service role and marked
  confirmed, then signed in immediately — so there is no confirmation email and nothing to click,
  regardless of the "Confirm email" toggle in the Supabase dashboard.
- The old `apps/admin` / `apps/api` apps are retired (excluded from the workspace).
- **Only the homepage is indexed by search engines.** Every other route sends
  `noindex, follow` — that default lives in `apps/web/src/app/layout.tsx`, and `/` opts back in.
  A new page is de-indexed automatically unless it deliberately opts in.
- **Playlists are the only grouping.** Categories were removed in schema 028 — every episode
  belongs to a playlist, and that is what listeners browse by.
- **`fullschema.sql` is the only database artefact.** There is no migration runner: edit that
  file and run it again. It is idempotent, so re-running it on a live database is safe.
