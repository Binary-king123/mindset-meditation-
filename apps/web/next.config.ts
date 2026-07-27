import fs from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * All environment config lives in a single .env at the repo root, outside
 * apps/. Next only auto-loads env files sitting next to next.config, so load
 * the root one here.
 *
 * This runs before the build, so NEXT_PUBLIC_* values are still inlined into
 * the client bundle correctly. Real environment variables take precedence, so
 * a production host (systemd EnvironmentFile, Docker -e, panel UI) can inject
 * secrets without any file on disk.
 */
function loadRootEnv() {
  const root = path.join(__dirname, '..', '..');
  // Keys this loader has set, so a real environment variable still wins but a
  // later line in the file can correct an earlier one.
  const fromFile = new Set<string>();

  // .env.local wins over .env, matching Next's own precedence.
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    const seen = new Set<string>();

    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (seen.has(key)) {
        // Duplicates are almost always a mistake — a key appended to the file
        // when a blank one already existed higher up. Silently keeping the
        // first made R2 look "not configured" with correct credentials sitting
        // ten lines below.
        console.warn(`[env] ${name}: "${key}" is defined more than once; using the last non-empty value.`);
      }
      seen.add(key);

      // A real environment variable (systemd, Docker -e, hosting panel) always
      // wins over the file.
      const setByEnvironment = process.env[key] !== undefined && !fromFile.has(key);
      if (setByEnvironment) continue;
      // Never let a blank line erase a value already found.
      if (value === '' && process.env[key]) continue;

      process.env[key] = value;
      fromFile.add(key);
    }
  }
}

loadRootEnv();

const isDev = process.env.NODE_ENV === 'development';

/**
 * Content Security Policy.
 *
 * 'unsafe-inline' for scripts is required because Next.js injects inline
 * bootstrap scripts and this app doesn't do nonce plumbing; 'unsafe-eval' is
 * dev-only (React Refresh). The directives that matter most here are
 * object-src / base-uri / frame-ancestors, which shut down the classic
 * injection and clickjacking vectors regardless of the inline allowance.
 *
 * Audio and images arrive as signed URLs from Supabase Storage or Cloudflare
 * R2, so https: is allowed for those fetches rather than pinning a host that
 * changes with the storage backend.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  `connect-src 'self' https: wss:${isDev ? ' ws:' : ''}`,
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

const nextConfig: NextConfig = {
  // Emits .next/standalone with only the node_modules actually needed — this is
  // what makes the app deployable to Hostinger / a plain VPS without shipping
  // the whole monorepo.
  output: 'standalone',
  // Monorepo root, so standalone traces files outside apps/web correctly.
  outputFileTracingRoot: `${__dirname}/../..`,

  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,

  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
    // lucide-react and framer-motion are barrel packages: a single named import
    // pulls the whole module graph into the client bundle. Rewriting them to
    // per-file imports cuts a large amount of JavaScript off every page, which
    // is the bulk of the "clicking feels slow" problem.
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  images: {
    remotePatterns: [
      // Covers and podcast artwork in public Supabase Storage.
      { protocol: 'https', hostname: '*.supabase.co' },
      // Cloudflare R2 public bucket / custom domain, when one is configured.
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.r2.cloudflarestorage.com' },
    ],
    formats: ['image/avif', 'image/webp'],
    // Artwork is immutable once uploaded (keys are content-addressed by
    // timestamp), so the optimizer can hold onto it.
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Signed media URLs are per-request; never let a proxy cache them.
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },

  async redirects() {
    return [
      { source: '/home', destination: '/', permanent: true },
      // The homepage anchor was renamed when the site became podcast-first.
      // Kept so older links and shares still land somewhere real.
      { source: '/sessions', destination: '/#episodes', permanent: true },
    ];
  },
};

export default nextConfig;
