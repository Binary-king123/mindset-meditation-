// Minimal .env loader (no dependency). Loads mindset-meditation/.env into
// process.env without overwriting values already present in the environment.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadEnv(file = join(here, '..', '.env')) {
  if (!existsSync(file)) return false;
  const content = readFileSync(file, 'utf8');
  // Keys set from the file, so a real environment variable still wins but a
  // later line can correct an earlier one. Must match the behaviour of
  // loadRootEnv() in apps/web/next.config.ts.
  const fromFile = new Set();
  const seen = new Set();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (seen.has(key)) {
      console.warn(`[env] "${key}" is defined more than once; using the last non-empty value.`);
    }
    seen.add(key);

    if (key in process.env && !fromFile.has(key)) continue; // real env wins
    if (val === '' && process.env[key]) continue; // don't blank an existing value

    process.env[key] = val;
    fromFile.add(key);
  }
  return true;
}
