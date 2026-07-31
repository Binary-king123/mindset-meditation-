-- =============================================================================
-- 030 — SEO metadata, generated search, and three broken-function fixes
-- =============================================================================
-- Upgrades a database already at 029 without re-running the whole of
-- fullschema.sql. Everything here is also present in fullschema.sql, which
-- remains the source of truth for a fresh install — this file exists only so an
-- existing database can be moved forward in one paste.
--
-- HOW TO RUN
--   Supabase SQL Editor -> paste this file -> Run
--   or: psql "$SUPABASE_DB_URL" -f migrations/030_seo_metadata_and_search.sql
--
-- SAFE TO RE-RUN. Every statement is idempotent and nothing is dropped that the
-- current schema still defines, so no row of real data is touched.
--
-- Requires: 029. Check with
--   SELECT version FROM podcast.schema_migrations ORDER BY version DESC LIMIT 1;
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Generated SEO metadata on tracks
-- -----------------------------------------------------------------------------
-- All derived from what the admin uploads (title, audio, cover, playlist) by
-- apps/web/src/lib/seo/generate.ts. Nullable so existing rows stay valid.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS excerpt          TEXT;
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS keywords         TEXT[];
-- created_at is when the file was uploaded; this is when it went public.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ;
-- Read in the browser at upload time — no server-side ffmpeg. file_size_bytes
-- is what the RSS <enclosure length> needs.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS file_size_bytes  BIGINT;
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS bitrate_kbps     INTEGER;
-- Base64 LQIP produced by downscaling the cover on a canvas before upload, so
-- next/image can use placeholder="blur" without sharp on the server.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS blur_data_url    TEXT;

ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_excerpt_check;
ALTER TABLE podcast.tracks ADD  CONSTRAINT tracks_excerpt_check CHECK (length(excerpt) <= 600);
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_meta_description_check;
ALTER TABLE podcast.tracks ADD  CONSTRAINT tracks_meta_description_check CHECK (length(meta_description) <= 320);

-- Give already-public episodes a publish date so the feed and sitemap can sort.
UPDATE podcast.tracks SET published_at = created_at
 WHERE published_at IS NULL AND status = 'published';

-- -----------------------------------------------------------------------------
-- 2. Full-text search
-- -----------------------------------------------------------------------------
-- to_tsvector MUST be the two-argument form: the one-argument version reads
-- default_text_search_config and is therefore STABLE, and a GENERATED column
-- only accepts IMMUTABLE expressions.
-- Weights: title (A) beats keywords (B) beats excerpt (C) beats description (D).
-- array_to_string() is marked STABLE, not IMMUTABLE: in general an element
-- type's output function need not be immutable, so Postgres marks the whole
-- function conservatively — and a GENERATED column rejects it outright with
-- "ERROR: 42P17: generation expression is not immutable". For TEXT[] the
-- conversion genuinely is immutable, so this narrowly-typed wrapper is safe to
-- declare as such. NULL folds to an empty array, so the result is never NULL.
-- Created only when absent, never replaced: once the generated column below
-- depends on this function, re-running this file must not attempt to redefine
-- it out from under that dependency.
DO $keywords_text$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'podcast' AND p.proname = 'keywords_text'
    ) THEN
        EXECUTE $fn$
            CREATE FUNCTION podcast.keywords_text(p_keywords TEXT[])
            RETURNS TEXT
            LANGUAGE sql
            IMMUTABLE
            PARALLEL SAFE
            AS $body$ SELECT array_to_string(coalesce(p_keywords, ARRAY[]::TEXT[]), ' ') $body$;
        $fn$;
    END IF;
END
$keywords_text$;

-- The generated column is evaluated as the inserting role, so that role needs
-- EXECUTE. New functions get it from PUBLIC by default; this is explicit so an
-- upgraded database does not depend on that default still being in place.
GRANT EXECUTE ON FUNCTION podcast.keywords_text(TEXT[]) TO anon, authenticated, service_role;

ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english'::regconfig, podcast.keywords_text(keywords)), 'B') ||
        setweight(to_tsvector('english'::regconfig, coalesce(excerpt, '')), 'C') ||
        setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'D')
    ) STORED;

ALTER TABLE podcast.playlists ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english'::regconfig, coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english'::regconfig, coalesce(description, '')), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_tracks_search    ON podcast.tracks    USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_playlists_search ON podcast.playlists USING GIN (search_vector);
-- The feed and sitemap both order published episodes by publish date.
CREATE INDEX IF NOT EXISTS idx_tracks_published_at
    ON podcast.tracks USING btree (published_at DESC) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Ranked search RPC
-- -----------------------------------------------------------------------------
-- An RPC rather than a PostgREST filter because ranking is the point: ts_rank
-- weights a title hit above a description hit, and PostgREST cannot order by a
-- computed rank. websearch_to_tsquery accepts what people actually type
-- (quoted phrases, OR, leading minus) without raising on punctuation.
--
-- The old five-argument signature was dropped in 028; this is a new function,
-- not a replacement, so the DROP below only matters on a database that still
-- carries the pre-028 version.
DROP FUNCTION IF EXISTS podcast.search_tracks(text, integer, integer, uuid, boolean);

CREATE OR REPLACE FUNCTION podcast.search_tracks(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE (
    id uuid,
    title text,
    slug text,
    excerpt text,
    short_description text,
    thumbnail_url text,
    duration_seconds integer,
    published_at timestamptz,
    created_at timestamptz,
    rank real
 )
 LANGUAGE sql
 STABLE
AS $function$
    SELECT t.id, t.title, t.slug, t.excerpt, t.short_description, t.thumbnail_url,
           t.duration_seconds, t.published_at, t.created_at,
           ts_rank(t.search_vector, websearch_to_tsquery('english'::regconfig, p_query)) AS rank
    FROM podcast.tracks t
    WHERE t.deleted_at IS NULL
      AND t.status = 'published'
      AND t.search_vector @@ websearch_to_tsquery('english'::regconfig, p_query)
    ORDER BY rank DESC, COALESCE(t.published_at, t.created_at) DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 50);
$function$
;

-- Deliberately NOT SECURITY DEFINER: it runs with the caller's RLS, and the
-- tracks_select policy already exposes published episodes to anon.
GRANT EXECUTE ON FUNCTION podcast.search_tracks(text, integer) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. Three functions that referenced objects this schema never creates
-- -----------------------------------------------------------------------------
-- is_super_admin() joined podcast.user_roles + podcast.roles, which migration
-- 021 collapsed into profiles.role. Because profiles_delete_admin USES this
-- function, every profile delete raised. Rewritten against the real column.
CREATE OR REPLACE FUNCTION podcast.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM podcast.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'super_admin'
    );
END;
$function$
;

-- Referenced a podcast.subscriptions table that does not exist; nothing calls it.
DROP FUNCTION IF EXISTS podcast.is_premium_user();
-- Refreshed a podcast.popular_tracks materialized view that does not exist.
DROP FUNCTION IF EXISTS podcast.refresh_popular_tracks();


-- -----------------------------------------------------------------------------
-- 6. Reconcile denormalised playlist counters
-- -----------------------------------------------------------------------------
-- playlists.track_count and .total_duration_seconds are maintained by
-- trg_playlist_stats, but a counter can drift from reality — a track removed
-- in a way that did not fire the trigger leaves the playlist advertising
-- sessions it no longer has (the index reads the counter; the detail page
-- counts real rows, so the two disagree on screen).
--
-- Recomputed from playlist_tracks, ignoring soft-deleted tracks, which is the
-- same definition the detail page uses.
UPDATE podcast.playlists p
SET track_count = COALESCE(s.cnt, 0),
    total_duration_seconds = COALESCE(s.secs, 0)
FROM (
    SELECT pl.id,
           COUNT(t.id)                        AS cnt,
           COALESCE(SUM(t.duration_seconds), 0) AS secs
    FROM podcast.playlists pl
    LEFT JOIN podcast.playlist_tracks pt ON pt.playlist_id = pl.id
    LEFT JOIN podcast.tracks t
           ON t.id = pt.track_id
          AND t.deleted_at IS NULL
    GROUP BY pl.id
) s
WHERE s.id = p.id
  AND (p.track_count IS DISTINCT FROM COALESCE(s.cnt, 0)
    OR p.total_duration_seconds IS DISTINCT FROM COALESCE(s.secs, 0));

-- -----------------------------------------------------------------------------
-- 7. Record the version
-- -----------------------------------------------------------------------------
INSERT INTO podcast.schema_migrations (version)
VALUES ('030_seo_metadata_and_search')
ON CONFLICT DO NOTHING;

COMMIT;

-- PostgREST caches the schema; without this it keeps serving the old column set
-- and the app 404s on meta_description, keywords and the search RPC.
NOTIFY pgrst, 'reload schema';
