# The Mindset Meditation

> Transform your mind, transform your life.

A guided-meditation streaming app. Listeners browse sessions and playlists, save
what they like, and comment; admins upload audio, organise it into playlists,
moderate comments and watch engagement analytics.

Built with Next.js 15 and Supabase, deployable to any Node host.

---

## Features

**For listeners**
- Browse guided meditation sessions by category or playlist
- Full player — queue, speed control, sleep timer, background playback
- **1-minute free preview** without an account; signing in unlocks full sessions
- Save sessions to a personal library
- Comment on sessions, with one level of threaded replies
- Share a session by link
- Light and dark themes

**For admins**
- Upload MP3s with cover art, straight from the browser to storage
- Create categories and playlists inline while uploading
- Edit any episode later — title, description, category, playlist, or replace the audio/cover
- Moderate comments and reply as the host
- Analytics: views today / yesterday / 7 / 15 / 30 days, unique listeners, retention and completion rates, plus a per-episode breakdown
- **Two-step sign-in**: password, then a verification code

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, Server Actions, standalone output) |
| Language | TypeScript |
| UI | Tailwind CSS, Framer Motion, lucide-react |
| State | Zustand (persisted player state) |
| Database | Supabase Postgres, accessed directly — no ORM |
| Auth | Supabase Auth + a second-factor code for admins |
| Storage | Cloudflare R2, or Supabase Storage as a zero-setup fallback |
| Tooling | pnpm workspaces, Turborepo, Biome |

Security is enforced in the database with Row Level Security, so the rules hold
even if a request bypasses the app.

---

## Quick start

**Requirements:** Node 20+, pnpm 9+, a Supabase project.

```bash
git clone https://github.com/<owner>/mindset-meditation.git
cd mindset-meditation
pnpm install
cp .env.example .env      # then fill it in — see below
```

**Create the database.** Open the Supabase dashboard → **SQL Editor**, paste all
of [`fullschema.sql`](./fullschema.sql), and run it. That single file creates the
schema, tables, indexes, functions, triggers, RLS policies, storage buckets and
the seed categories.

Then confirm **Settings → API → Exposed schemas** includes `podcast`.

**Create an admin.** Credentials are passed in, never stored on disk:

```bash
pnpm seed:admin -- --email you@example.com --password 'a-strong-password'
```

**Run it:**

```bash
pnpm --filter @mindset/web dev     # http://localhost:3100
```

---

## Environment

One `.env` at the repo root — there is deliberately none inside `apps/`.
See [`.env.example`](./.env.example) for the annotated list.

| Variable | Required | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public key; RLS is what protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Server only.** Bypasses RLS — never expose it |
| `NEXT_PUBLIC_APP_URL` | ✅ | Your public origin. Drives canonical URLs, sitemap, Open Graph |
| `ADMIN_VERIFICATION_CODE` | ✅ | Second factor for `/admin`. Any text you choose |
| `SUPABASE_DB_URL` | — | Optional. Only if you prefer running SQL from a terminal |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | — | Optional. Leave blank to use Supabase Storage |

Real environment variables override the file, so production hosts can inject
secrets with nothing on disk.

---

## Admin access

Signing in to `/admin` takes two steps:

1. Email **or** username, plus password
2. The `ADMIN_VERIFICATION_CODE` from your `.env`

The code is compared on the server and never sent to the browser. Proof is kept
in a signed, HttpOnly cookie for 12 hours; five wrong attempts locks the account
for 15 minutes. Changing the code signs every admin out.

Roles cannot be changed from inside the app — `profiles.role` is not writable by
the API roles, so a signed-in user cannot promote themselves. Grant admin with
`pnpm seed:admin` or from the Supabase SQL editor.

---

## Audio storage

Audio is private either way; playback always goes through a short-lived signed
URL, and only the object key is stored in the database.

- **Cloudflare R2** — set all four `R2_*` variables
- **Supabase Storage** — leave them blank; works with no extra setup

The app picks the backend at runtime and `/admin/upload` shows which one is
live. Each episode records its own backend, so you can switch without breaking
what is already uploaded. Setup walkthrough: [`DEPLOY.md`](./DEPLOY.md) §2b.

---

## Project structure

```
apps/web            the Next.js application
  src/app           routes, server actions, API handlers
  src/components    UI — layout, player, podcast, playlist, admin
  src/lib           supabase clients, SEO, audio storage, admin 2FA
packages/types      shared TypeScript types
scripts             admin seeding, deploy helper
fullschema.sql      the entire database in one file
DEPLOY.md           production deployment guide
SETUP.md            local setup walkthrough
```

---

## Deployment

Builds to a self-contained Node server (`output: 'standalone'`), so it runs on a
VPS, Hostinger Cloud, Docker or any Node host — no platform lock-in.

```bash
pnpm --filter @mindset/web build
```

Full instructions, including systemd and Nginx, are in [`DEPLOY.md`](./DEPLOY.md).

> Shared hosting cannot run this — it needs a Node process, so a VPS or Cloud
> plan is required.

---

## Security

- Row Level Security on every table; policies enforced in Postgres, not just the UI
- Private audio bucket — no public object URLs
- Draft episodes invisible to the public via RLS
- CSP, HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and
  `Permissions-Policy` set in `next.config.ts`
- Admin routes gated in middleware **and** re-checked server-side
- Service-role key is server-only and verified absent from the client bundle

Found a security issue? Please open an issue rather than a public PR.

---

## Scripts

| Command | Does |
|---|---|
| `pnpm --filter @mindset/web dev` | Dev server on :3100 |
| `pnpm --filter @mindset/web build` | Production build |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm lint` | Biome |
| `pnpm seed:admin` | Create or promote an admin account |

---

## License

Not currently licensed for reuse. All rights reserved.
