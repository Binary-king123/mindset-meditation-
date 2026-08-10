-- =============================================================================
-- The Mindset Meditation — FULL DATABASE SCHEMA
-- =============================================================================
-- Creates the ENTIRE database in one run: schema, tables, indexes, functions,
-- triggers, row-level security, storage buckets, API exposure and seed data.
--
-- THIS FILE IS THE SOURCE OF TRUTH for the database. There is no migration
-- runner and no ./migrations directory: to change the schema you edit this
-- file and run it again.
--
-- HOW TO RUN IT
--   Supabase SQL Editor  -> paste the whole file, Run.
--   or psql              -> psql "$SUPABASE_DB_URL" -f fullschema.sql
--
-- SAFE TO RE-RUN on a live database. Every statement is idempotent:
--   * CREATE TABLE / INDEX          use IF NOT EXISTS
--   * CREATE POLICY / TRIGGER       are preceded by DROP ... IF EXISTS
--   * CREATE OR REPLACE FUNCTION    replaces in place
--   * seed INSERTs                  use ON CONFLICT DO NOTHING
-- Re-running never drops a table that the current schema still defines, so no
-- row of real data is lost. The one destructive statement is in LEGACY CLEANUP
-- below and only removes objects this schema no longer has.
--
-- Keep the TypeScript mirror in step: packages/types/src/index.ts declares the
-- same columns, and drift there is invisible until it breaks at runtime.
--
-- WARNING: the DROP SCHEMA below destroys existing podcast data.
-- It is commented out. Uncomment only for a deliberate clean rebuild.
-- =============================================================================

-- DROP SCHEMA IF EXISTS podcast CASCADE;

CREATE SCHEMA IF NOT EXISTS podcast;
GRANT USAGE ON SCHEMA podcast TO anon, authenticated, service_role;

-- gen_random_uuid() is built into PostgreSQL 13+; this is belt and braces.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;


-- =============================================================================
-- LEGACY CLEANUP
-- =============================================================================
-- No-ops on a fresh database — none of these objects are created below any
-- more. They are here so that running this file over a database built by an
-- older version still lands on the current schema.
--
-- DESTRUCTIVE, but only for objects the current schema no longer defines:
-- `categories` was replaced by playlists. On any database built by this file
-- these are already gone and every line here is a no-op.

DROP TABLE IF EXISTS podcast.categories CASCADE;   -- also drops tracks_category_id_fkey
ALTER TABLE IF EXISTS podcast.tracks DROP COLUMN IF EXISTS category_id;
DROP INDEX IF EXISTS podcast.idx_tracks_category_id;

-- Dead since the search columns it reads (is_premium, search_vector) were
-- removed; it also carried the category filter.
DROP FUNCTION IF EXISTS podcast.search_tracks(text, integer, integer, uuid, boolean);

-- The show record now holds nothing but the platform links — the podcast name
-- and description come from lib/brand.ts, and the homepage artwork from the
-- newest playlist's cover.
ALTER TABLE IF EXISTS podcast.show
    DROP COLUMN IF EXISTS name,
    DROP COLUMN IF EXISTS tagline,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS cover_url,
    DROP COLUMN IF EXISTS cover_path;


-- =============================================================================
-- TABLES
-- =============================================================================

CREATE TABLE IF NOT EXISTS podcast.comments (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    track_id UUID NOT NULL,
    user_id UUID NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    parent_id UUID
);

CREATE TABLE IF NOT EXISTS podcast.favorites (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID NOT NULL,
    track_id UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS podcast.play_events (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    track_id UUID NOT NULL,
    user_id UUID,
    session_id TEXT NOT NULL,
    listened_seconds INTEGER DEFAULT 0 NOT NULL,
    duration_seconds INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    -- Request context, recorded by /api/stream from headers it already holds.
    -- All NULLable and forward-only: rows written before 035 never had this
    -- information, so the dashboard reports them as "Unknown" rather than
    -- dropping them out of percentages and quietly changing the denominator.
    country TEXT,
    referrer_host TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    language TEXT
);

-- CREATE TABLE IF NOT EXISTS is a no-op on a database that already has the
-- table, so the same columns are added again here for the upgrade path.
ALTER TABLE podcast.play_events
    ADD COLUMN IF NOT EXISTS country       TEXT,
    ADD COLUMN IF NOT EXISTS referrer_host TEXT,
    ADD COLUMN IF NOT EXISTS device_type   TEXT,
    ADD COLUMN IF NOT EXISTS browser       TEXT,
    ADD COLUMN IF NOT EXISTS os            TEXT,
    ADD COLUMN IF NOT EXISTS language      TEXT;

COMMENT ON COLUMN podcast.play_events.country IS
    'ISO-3166-1 alpha-2 from a CDN geo header. NULL when no CDN is in front of the app.';
COMMENT ON COLUMN podcast.play_events.referrer_host IS
    'Hostname only, never the full URL — the path can carry personal data and is not needed to attribute traffic.';

CREATE TABLE IF NOT EXISTS podcast.playlist_tracks (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    playlist_id UUID NOT NULL,
    track_id UUID NOT NULL,
    position INTEGER DEFAULT 0 NOT NULL,
    added_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS podcast.playlists (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    user_id UUID NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    thumbnail_url TEXT,
    is_public BOOLEAN DEFAULT false NOT NULL,
    track_count INTEGER DEFAULT 0 NOT NULL,
    total_duration_seconds BIGINT DEFAULT 0 NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    slug TEXT,
    -- Storage key of the cover, so replacing artwork can clean up the old file
    -- (same pairing as tracks.thumbnail_url / thumbnail_path).
    thumbnail_path TEXT
);

ALTER TABLE podcast.playlists ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;

CREATE TABLE IF NOT EXISTS podcast.profiles (
    id UUID NOT NULL,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    username TEXT,
    role TEXT DEFAULT 'user'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS podcast.schema_migrations (
    version TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Where the podcast can be listened to off-site. Exactly one row ever exists —
-- `id` is a boolean fixed to true by a CHECK, so a second INSERT collides on
-- the primary key.
--
-- `platform_links` is a JSONB map keyed by platform id ("spotify", "apple", …)
-- rather than one column per platform, so adding a service later needs no
-- migration at all. lib/platforms.ts is the matching list on the app side, and
-- podcast.tracks.platform_links overrides these per episode.
--
-- The podcast's name and description live in lib/brand.ts; the homepage
-- artwork is the newest playlist's cover.
CREATE TABLE IF NOT EXISTS podcast.show (
    id BOOLEAN DEFAULT true NOT NULL,
    platform_links JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS podcast.tracks (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    description TEXT,
    short_description TEXT,
    duration_seconds INTEGER NOT NULL,
    audio_url TEXT NOT NULL,
    audio_path TEXT NOT NULL,
    thumbnail_url TEXT,
    thumbnail_path TEXT,
    instructor_name TEXT,
    status TEXT DEFAULT 'draft'::text NOT NULL,
    play_count BIGINT DEFAULT 0 NOT NULL,
    favorite_count BIGINT DEFAULT 0 NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    comment_count BIGINT DEFAULT 0 NOT NULL,
    -- Per-episode overrides for the show-level links above. Empty = inherit.
    platform_links JSONB DEFAULT '{}'::jsonb NOT NULL
);

-- CREATE TABLE IF NOT EXISTS cannot add a column to a table that already
-- exists, so existing databases get the new column here (migration 027).
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS platform_links JSONB DEFAULT '{}'::jsonb NOT NULL;

-- Generated SEO metadata. Every one of these is derived from what the admin
-- uploads (title, audio, cover, playlist) — see lib/seo/generate.ts. Nullable
-- so this file stays safe to re-run over a populated table.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS excerpt          TEXT;
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS keywords         TEXT[];
-- created_at is when the file was uploaded; this is when it went public. A
-- draft sat on for a month should not date its RSS item to the upload.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS published_at     TIMESTAMPTZ;
-- Read in the browser at upload time (File.size and a derived rate) — no
-- server-side ffmpeg. file_size_bytes is required for the RSS <enclosure>.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS file_size_bytes  BIGINT;
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS bitrate_kbps     INTEGER;
-- Tiny base64 LQIP produced by downscaling the cover on a canvas before
-- upload, so next/image can render placeholder="blur" without sharp.
ALTER TABLE podcast.tracks ADD COLUMN IF NOT EXISTS blur_data_url    TEXT;

ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_excerpt_check;
ALTER TABLE podcast.tracks ADD  CONSTRAINT tracks_excerpt_check CHECK (length(excerpt) <= 600);
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_meta_description_check;
ALTER TABLE podcast.tracks ADD  CONSTRAINT tracks_meta_description_check CHECK (length(meta_description) <= 320);

-- Backfill published_at for rows that were already public before this column
-- existed, so the feed and sitemap have a date to sort by.
UPDATE podcast.tracks SET published_at = created_at
 WHERE published_at IS NULL AND status = 'published';


-- Full-text search. `to_tsvector` must be the TWO-argument form here: the
-- one-argument version is STABLE (it reads default_text_search_config) and a
-- GENERATED column only accepts IMMUTABLE expressions.
-- Weights: title beats keywords beats excerpt beats the full description.
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


-- =============================================================================
-- CONSTRAINTS
-- =============================================================================
-- Foreign keys are dropped first, before the primary/unique constraints they
-- reference — dropping a referenced PK/unique while a dependent FK still
-- exists fails with "cannot drop constraint ... because other objects depend
-- on it" (2BP01). comments_parent_id_fkey is self-referential (references
-- comments.id), so re-running this file against a database that already has
-- it would always hit this on comments_pkey specifically. Every FK below is
-- re-added at the end of this section, once its target constraint exists again.
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_track_id_fkey;
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_parent_id_fkey;
ALTER TABLE podcast.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_fkey;
ALTER TABLE podcast.favorites DROP CONSTRAINT IF EXISTS favorites_track_id_fkey;
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_track_id_fkey;
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_user_id_fkey;
ALTER TABLE podcast.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_track_id_fkey;
ALTER TABLE podcast.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_playlist_id_fkey;
ALTER TABLE podcast.playlists DROP CONSTRAINT IF EXISTS playlists_user_id_fkey;
ALTER TABLE podcast.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_pkey;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_pkey PRIMARY KEY (id);
ALTER TABLE podcast.favorites DROP CONSTRAINT IF EXISTS favorites_pkey;
ALTER TABLE podcast.favorites ADD CONSTRAINT favorites_pkey PRIMARY KEY (id);
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_pkey;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_pkey PRIMARY KEY (id);
ALTER TABLE podcast.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_pkey;
ALTER TABLE podcast.playlist_tracks ADD CONSTRAINT playlist_tracks_pkey PRIMARY KEY (id);
ALTER TABLE podcast.playlists DROP CONSTRAINT IF EXISTS playlists_pkey;
ALTER TABLE podcast.playlists ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);
ALTER TABLE podcast.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE podcast.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE podcast.schema_migrations DROP CONSTRAINT IF EXISTS schema_migrations_pkey;
ALTER TABLE podcast.schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);
ALTER TABLE podcast.show DROP CONSTRAINT IF EXISTS show_pkey;
ALTER TABLE podcast.show ADD CONSTRAINT show_pkey PRIMARY KEY (id);
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_pkey;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_pkey PRIMARY KEY (id);
ALTER TABLE podcast.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_track_id_key;
ALTER TABLE podcast.favorites ADD CONSTRAINT favorites_user_id_track_id_key UNIQUE (user_id, track_id);
ALTER TABLE podcast.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_playlist_id_track_id_key;
ALTER TABLE podcast.playlist_tracks ADD CONSTRAINT playlist_tracks_playlist_id_track_id_key UNIQUE (playlist_id, track_id);
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_slug_key;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_slug_key UNIQUE (slug);
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_body_check;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_body_check CHECK (((length(TRIM(BOTH FROM body)) >= 1) AND (length(TRIM(BOTH FROM body)) <= 2000)));
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_duration_seconds_check;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_duration_seconds_check CHECK ((duration_seconds >= 0));
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_listened_seconds_check;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_listened_seconds_check CHECK ((listened_seconds >= 0));
-- Free-text from a header is not something to trust into a chart legend
-- unmoderated. The write path maps user-agents onto a small fixed vocabulary;
-- this constraint is what makes that mapping load-bearing rather than a
-- convention someone can forget.
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_device_type_check;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_device_type_check CHECK ((device_type IS NULL OR device_type = ANY (ARRAY['mobile'::text, 'tablet'::text, 'desktop'::text, 'tv'::text, 'bot'::text, 'other'::text])));
ALTER TABLE podcast.playlists DROP CONSTRAINT IF EXISTS playlists_description_check;
ALTER TABLE podcast.playlists ADD CONSTRAINT playlists_description_check CHECK ((length(description) <= 1000));
ALTER TABLE podcast.playlists DROP CONSTRAINT IF EXISTS playlists_title_check;
ALTER TABLE podcast.playlists ADD CONSTRAINT playlists_title_check CHECK ((length(title) <= 200));
ALTER TABLE podcast.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE podcast.profiles ADD CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['user'::text, 'moderator'::text, 'admin'::text, 'super_admin'::text])));
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_status_check;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])));
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_title_check;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_title_check CHECK ((length(title) <= 255));
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_duration_seconds_check;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_duration_seconds_check CHECK ((duration_seconds > 0));
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_short_description_check;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_short_description_check CHECK ((length(short_description) <= 300));
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_description_check;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_description_check CHECK ((length(description) <= 5000));
-- Forces podcast.show to hold at most one row: the only value that satisfies
-- the check is true, and true is already the primary key.
ALTER TABLE podcast.show DROP CONSTRAINT IF EXISTS show_singleton_check;
ALTER TABLE podcast.show ADD CONSTRAINT show_singleton_check CHECK ((id = true));
-- A JSON object, never an array or scalar — the app indexes it by platform id.
ALTER TABLE podcast.show DROP CONSTRAINT IF EXISTS show_platform_links_check;
ALTER TABLE podcast.show ADD CONSTRAINT show_platform_links_check CHECK ((jsonb_typeof(platform_links) = 'object'::text));
ALTER TABLE podcast.tracks DROP CONSTRAINT IF EXISTS tracks_platform_links_check;
ALTER TABLE podcast.tracks ADD CONSTRAINT tracks_platform_links_check CHECK ((jsonb_typeof(platform_links) = 'object'::text));
-- Already dropped above (before the PK/UNIQUE/CHECK section they depend on);
-- only re-adding is needed here.
ALTER TABLE podcast.comments ADD CONSTRAINT comments_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE CASCADE;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES podcast.comments(id) ON DELETE CASCADE;
ALTER TABLE podcast.favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE CASCADE;
ALTER TABLE podcast.favorites ADD CONSTRAINT favorites_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE SET NULL;
ALTER TABLE podcast.playlist_tracks ADD CONSTRAINT playlist_tracks_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.playlist_tracks ADD CONSTRAINT playlist_tracks_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES podcast.playlists(id) ON DELETE CASCADE;
ALTER TABLE podcast.playlists ADD CONSTRAINT playlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE CASCADE;
ALTER TABLE podcast.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS comments_parent_idx ON podcast.comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS comments_track_parent_idx ON podcast.comments USING btree (track_id, parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_track_id ON podcast.comments USING btree (track_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON podcast.comments USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_track_id ON podcast.favorites USING btree (track_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON podcast.favorites USING btree (user_id);
CREATE INDEX IF NOT EXISTS play_events_created_idx ON podcast.play_events USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS play_events_listener_idx ON podcast.play_events USING btree (created_at DESC, user_id, session_id);
CREATE INDEX IF NOT EXISTS play_events_track_created_idx ON podcast.play_events USING btree (track_id, created_at DESC);
-- Reach breakdowns all filter by created_at and group by one dimension.
CREATE INDEX IF NOT EXISTS play_events_country_idx ON podcast.play_events USING btree (created_at DESC, country);
CREATE INDEX IF NOT EXISTS play_events_referrer_idx ON podcast.play_events USING btree (created_at DESC, referrer_host);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist_id ON podcast.playlist_tracks USING btree (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_position ON podcast.playlist_tracks USING btree (playlist_id, "position");
CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track_id ON podcast.playlist_tracks USING btree (track_id);
CREATE INDEX IF NOT EXISTS idx_playlists_is_public ON podcast.playlists USING btree (is_public) WHERE (is_public = true);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON podcast.playlists USING btree (user_id);
CREATE INDEX IF NOT EXISTS playlists_public_idx ON podcast.playlists USING btree (is_public, created_at DESC) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS playlists_slug_lower_key ON podcast.playlists USING btree (lower(slug)) WHERE (slug IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON podcast.profiles USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_key ON podcast.profiles USING btree (lower(email));
CREATE INDEX IF NOT EXISTS profiles_role_idx ON podcast.profiles USING btree (role) WHERE (role <> 'user'::text);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key ON podcast.profiles USING btree (lower(username)) WHERE (username IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON podcast.tracks USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracks_deleted_at ON podcast.tracks USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON podcast.tracks USING btree (play_count DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_tracks_slug ON podcast.tracks USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_tracks_search ON podcast.tracks USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_playlists_search ON podcast.playlists USING GIN (search_vector);
-- Feed and sitemap both order published episodes by publish date.
CREATE INDEX IF NOT EXISTS idx_tracks_published_at ON podcast.tracks USING btree (published_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tracks_status ON podcast.tracks USING btree (status) WHERE (deleted_at IS NULL);


-- =============================================================================
-- FUNCTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION podcast.check_comment_parent()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    parent RECORD;
BEGIN
    IF NEW.parent_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT track_id, parent_id INTO parent
    FROM podcast.comments WHERE id = NEW.parent_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent comment does not exist';
    END IF;
    IF parent.track_id <> NEW.track_id THEN
        RAISE EXCEPTION 'Reply must be on the same track as its parent';
    END IF;
    IF parent.parent_id IS NOT NULL THEN
        RAISE EXCEPTION 'Replies cannot be nested more than one level';
    END IF;

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.get_play_analytics(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    result JSONB;
BEGIN
    IF NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    SELECT JSONB_BUILD_OBJECT(
        'today',        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('day', NOW())),
        'yesterday',    COUNT(*) FILTER (
                            WHERE created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '1 day'
                              AND created_at <  DATE_TRUNC('day', NOW())),
        'last_7',       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days'),
        'last_15',      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '15 days'),
        'last_30',      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days'),
        'total',        COUNT(*),
        'unique_listeners', COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)),
        'signed_in',    COUNT(*) FILTER (WHERE user_id IS NOT NULL),
        -- Retention: how much of an episode a listener actually got through.
        'retention',    COALESCE(ROUND(AVG(
                            LEAST(listened_seconds::NUMERIC / NULLIF(duration_seconds, 0), 1)
                        ) FILTER (WHERE duration_seconds > 0) * 100, 1), 0),
        'completion',   COALESCE(ROUND(
                            COUNT(*) FILTER (
                                WHERE duration_seconds > 0
                                  AND listened_seconds::NUMERIC / duration_seconds >= 0.9
                            )::NUMERIC * 100 / NULLIF(COUNT(*) FILTER (WHERE duration_seconds > 0), 0), 1), 0)
    )
    INTO result
    FROM podcast.play_events
    WHERE created_at >= NOW() - (p_days || ' days')::INTERVAL
       OR p_days IS NULL;

    RETURN COALESCE(result, '{}'::JSONB);
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.get_play_timeseries(p_days integer DEFAULT 14)
 RETURNS TABLE(day date, views bigint, listeners bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    IF NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT d::DATE,
           COUNT(pe.id),
           COUNT(DISTINCT COALESCE(pe.user_id::TEXT, pe.session_id))
    FROM GENERATE_SERIES(
             DATE_TRUNC('day', NOW()) - ((p_days - 1) || ' days')::INTERVAL,
             DATE_TRUNC('day', NOW()),
             '1 day'
         ) d
    LEFT JOIN podcast.play_events pe
           ON pe.created_at >= d AND pe.created_at < d + INTERVAL '1 day'
    GROUP BY d
    ORDER BY d;
END;
$function$
;

-- -----------------------------------------------------------------------------
-- Admin dashboard aggregates (035)
-- -----------------------------------------------------------------------------
-- get_play_analytics/get_play_timeseries above answer "how many plays" and
-- nothing else. These four answer the rest of the questions the admin
-- dashboard asks, and they aggregate in the database: the page used to fetch up
-- to 10,000 play_events rows and reduce them in JS for per-episode retention,
-- which silently goes wrong the moment a window exceeds that cap.

-- Current-window figures alongside the immediately preceding window of the same
-- length, so the UI can show direction of travel without a second round trip
-- and without inventing a baseline.
CREATE OR REPLACE FUNCTION podcast.get_admin_dashboard(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = podcast, public
AS $function$
DECLARE
    v_days     INTEGER := GREATEST(COALESCE(p_days, 30), 1);
    v_start    TIMESTAMPTZ := NOW() - (v_days || ' days')::INTERVAL;
    v_prev     TIMESTAMPTZ := NOW() - (v_days * 2 || ' days')::INTERVAL;
    v_result   JSONB;
BEGIN
    IF NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    WITH win AS (
        SELECT * FROM podcast.play_events WHERE created_at >= v_start
    ),
    prev AS (
        SELECT * FROM podcast.play_events
        WHERE created_at >= v_prev AND created_at < v_start
    ),
    -- A "listener" is a signed-in user if we know one, otherwise the browser
    -- session. Mixing the two in a single COALESCE is what makes the count
    -- stable when someone signs in halfway through their listening history.
    sessions AS (
        SELECT COALESCE(user_id::TEXT, session_id) AS listener,
               COUNT(*) AS plays
        FROM win GROUP BY 1
    ),
    -- First time we ever saw this listener, so "new" means new to the product,
    -- not merely new to the window.
    first_seen AS (
        SELECT COALESCE(user_id::TEXT, session_id) AS listener,
               MIN(created_at) AS first_at
        FROM podcast.play_events GROUP BY 1
    )
    SELECT JSONB_BUILD_OBJECT(
        'days', v_days,
        'plays',            (SELECT COUNT(*) FROM win),
        'plays_prev',       (SELECT COUNT(*) FROM prev),
        'plays_total',      (SELECT COUNT(*) FROM podcast.play_events),
        'plays_today',      (SELECT COUNT(*) FROM podcast.play_events
                             WHERE created_at >= DATE_TRUNC('day', NOW())),
        'plays_yesterday',  (SELECT COUNT(*) FROM podcast.play_events
                             WHERE created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '1 day'
                               AND created_at <  DATE_TRUNC('day', NOW())),
        'listeners',        (SELECT COUNT(*) FROM sessions),
        'listeners_prev',   (SELECT COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM prev),
        'listeners_total',  (SELECT COUNT(DISTINCT COALESCE(user_id::TEXT, session_id))
                             FROM podcast.play_events),
        'listeners_new',    (SELECT COUNT(*) FROM first_seen WHERE first_at >= v_start),
        'listeners_repeat', (SELECT COUNT(*) FROM sessions WHERE plays > 1),
        -- signed_in_plays counts events, not people — one account listening ten
        -- times is ten signed-in plays.
        'signed_in_plays',  (SELECT COUNT(*) FROM win WHERE user_id IS NOT NULL),
        'anon_plays',       (SELECT COUNT(*) FROM win WHERE user_id IS NULL),
        -- The honest "how much" figure: summed heard-seconds, not plays ×
        -- episode length.
        'listened_seconds',      (SELECT COALESCE(SUM(listened_seconds), 0) FROM win),
        'listened_seconds_prev', (SELECT COALESCE(SUM(listened_seconds), 0) FROM prev),
        'listened_seconds_total',(SELECT COALESCE(SUM(listened_seconds), 0) FROM podcast.play_events),
        'avg_listen_seconds',    (SELECT COALESCE(ROUND(AVG(listened_seconds)), 0) FROM win),
        'retention',  (SELECT COALESCE(ROUND(AVG(
                          LEAST(listened_seconds::NUMERIC / NULLIF(duration_seconds, 0), 1)
                      ) FILTER (WHERE duration_seconds > 0) * 100, 1), 0) FROM win),
        'completion', (SELECT COALESCE(ROUND(
                          COUNT(*) FILTER (WHERE duration_seconds > 0
                                             AND listened_seconds::NUMERIC / duration_seconds >= 0.9
                          )::NUMERIC * 100
                          / NULLIF(COUNT(*) FILTER (WHERE duration_seconds > 0), 0), 1), 0) FROM win),
        'saves',          (SELECT COUNT(*) FROM podcast.favorites WHERE created_at >= v_start),
        'saves_prev',     (SELECT COUNT(*) FROM podcast.favorites
                           WHERE created_at >= v_prev AND created_at < v_start),
        'saves_total',    (SELECT COUNT(*) FROM podcast.favorites),
        'comments',       (SELECT COUNT(*) FROM podcast.comments WHERE created_at >= v_start),
        'comments_prev',  (SELECT COUNT(*) FROM podcast.comments
                           WHERE created_at >= v_prev AND created_at < v_start),
        'comments_total', (SELECT COUNT(*) FROM podcast.comments),
        -- Deliberately NOT called followers: this product has no follow
        -- relationship, and labelling registrations as followers is the kind of
        -- flattering mislabel this dashboard is meant to stop doing.
        'accounts',       (SELECT COUNT(*) FROM podcast.profiles WHERE created_at >= v_start),
        'accounts_prev',  (SELECT COUNT(*) FROM podcast.profiles
                           WHERE created_at >= v_prev AND created_at < v_start),
        'accounts_total', (SELECT COUNT(*) FROM podcast.profiles),
        'tracks_published', (SELECT COUNT(*) FROM podcast.tracks
                             WHERE status = 'published' AND deleted_at IS NULL),
        'tracks_draft',     (SELECT COUNT(*) FROM podcast.tracks
                             WHERE status = 'draft' AND deleted_at IS NULL),
        'catalog_seconds',  (SELECT COALESCE(SUM(duration_seconds), 0) FROM podcast.tracks
                             WHERE deleted_at IS NULL),
        -- True when no row in the window carries geo data, which is the normal
        -- state without a CDN. Lets the UI say so instead of drawing a blank.
        'has_geo', (SELECT EXISTS (SELECT 1 FROM win WHERE country IS NOT NULL))
    ) INTO v_result;

    RETURN COALESCE(v_result, '{}'::JSONB);
END;
$function$
;

-- GENERATE_SERIES on the left of every join so quiet days appear as zeros. A
-- chart that silently omits empty days misrepresents a gap as a plateau.
CREATE OR REPLACE FUNCTION podcast.get_admin_timeseries(p_days integer DEFAULT 30)
 RETURNS TABLE(
     day date,
     plays bigint,
     listeners bigint,
     listened_seconds bigint,
     saves bigint,
     comments bigint,
     signups bigint
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = podcast, public
AS $function$
DECLARE
    v_days INTEGER := GREATEST(COALESCE(p_days, 30), 1);
BEGIN
    IF NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    WITH d AS (
        SELECT generate_series(
            DATE_TRUNC('day', NOW()) - ((v_days - 1) || ' days')::INTERVAL,
            DATE_TRUNC('day', NOW()),
            '1 day'
        ) AS bucket
    )
    SELECT d.bucket::DATE,
           (SELECT COUNT(*) FROM podcast.play_events pe
             WHERE pe.created_at >= d.bucket AND pe.created_at < d.bucket + INTERVAL '1 day'),
           (SELECT COUNT(DISTINCT COALESCE(pe.user_id::TEXT, pe.session_id)) FROM podcast.play_events pe
             WHERE pe.created_at >= d.bucket AND pe.created_at < d.bucket + INTERVAL '1 day'),
           (SELECT COALESCE(SUM(pe.listened_seconds), 0)::BIGINT FROM podcast.play_events pe
             WHERE pe.created_at >= d.bucket AND pe.created_at < d.bucket + INTERVAL '1 day'),
           (SELECT COUNT(*) FROM podcast.favorites f
             WHERE f.created_at >= d.bucket AND f.created_at < d.bucket + INTERVAL '1 day'),
           (SELECT COUNT(*) FROM podcast.comments c
             WHERE c.created_at >= d.bucket AND c.created_at < d.bucket + INTERVAL '1 day'),
           (SELECT COUNT(*) FROM podcast.profiles p
             WHERE p.created_at >= d.bucket AND p.created_at < d.bucket + INTERVAL '1 day')
    FROM d
    ORDER BY d.bucket;
END;
$function$
;

-- Per-episode, aggregated in the database. Saves and comments come from their
-- own tables rather than the denormalised counters on tracks, because those
-- counters are all-time and this is windowed.
CREATE OR REPLACE FUNCTION podcast.get_admin_track_stats(p_days integer DEFAULT 30)
 RETURNS TABLE(
     track_id uuid,
     title text,
     slug text,
     status text,
     published_at timestamptz,
     duration_seconds integer,
     plays bigint,
     listeners bigint,
     listened_seconds bigint,
     retention numeric,
     completions bigint,
     saves bigint,
     comments bigint,
     last_played_at timestamptz
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = podcast, public
AS $function$
DECLARE
    v_days  INTEGER := GREATEST(COALESCE(p_days, 30), 1);
    v_start TIMESTAMPTZ := NOW() - (v_days || ' days')::INTERVAL;
BEGIN
    IF NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    RETURN QUERY
    SELECT t.id,
           t.title,
           t.slug,
           t.status,
           t.published_at,
           t.duration_seconds,
           COALESCE(p.plays, 0),
           COALESCE(p.listeners, 0),
           COALESCE(p.listened_seconds, 0),
           COALESCE(p.retention, 0),
           COALESCE(p.completions, 0),
           COALESCE(s.saves, 0),
           COALESCE(c.comments, 0),
           p.last_played_at
    FROM podcast.tracks t
    LEFT JOIN (
        SELECT pe.track_id,
               COUNT(*)                                                   AS plays,
               COUNT(DISTINCT COALESCE(pe.user_id::TEXT, pe.session_id))   AS listeners,
               COALESCE(SUM(pe.listened_seconds), 0)::BIGINT               AS listened_seconds,
               COALESCE(ROUND(AVG(
                   LEAST(pe.listened_seconds::NUMERIC / NULLIF(pe.duration_seconds, 0), 1)
               ) FILTER (WHERE pe.duration_seconds > 0) * 100, 1), 0)      AS retention,
               COUNT(*) FILTER (WHERE pe.duration_seconds > 0
                                  AND pe.listened_seconds::NUMERIC / pe.duration_seconds >= 0.9) AS completions,
               MAX(pe.created_at)                                          AS last_played_at
        FROM podcast.play_events pe
        WHERE pe.created_at >= v_start
        GROUP BY pe.track_id
    ) p ON p.track_id = t.id
    LEFT JOIN (
        SELECT f.track_id, COUNT(*) AS saves
        FROM podcast.favorites f WHERE f.created_at >= v_start GROUP BY f.track_id
    ) s ON s.track_id = t.id
    LEFT JOIN (
        SELECT cm.track_id, COUNT(*) AS comments
        FROM podcast.comments cm WHERE cm.created_at >= v_start GROUP BY cm.track_id
    ) c ON c.track_id = t.id
    WHERE t.deleted_at IS NULL
    ORDER BY COALESCE(p.plays, 0) DESC, t.title ASC;
END;
$function$
;

-- Where listeners come from. Each dimension is capped at its top 8 values so
-- one long tail cannot make the payload unbounded. NULLs are surfaced as
-- 'Unknown' rather than filtered out, so segments always sum to the play total
-- and nothing is quietly hidden.
CREATE OR REPLACE FUNCTION podcast.get_admin_reach(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = podcast, public
AS $function$
DECLARE
    v_days   INTEGER := GREATEST(COALESCE(p_days, 30), 1);
    v_start  TIMESTAMPTZ := NOW() - (v_days || ' days')::INTERVAL;
    v_result JSONB;
BEGIN
    IF NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Forbidden';
    END IF;

    WITH win AS (
        SELECT * FROM podcast.play_events WHERE created_at >= v_start
    ),
    dim AS (
        SELECT 'device'   AS d, COALESCE(device_type, 'Unknown')   AS k, COUNT(*) AS plays,
               COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) AS listeners FROM win GROUP BY 2
        UNION ALL
        SELECT 'browser', COALESCE(browser, 'Unknown'), COUNT(*),
               COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM win GROUP BY 2
        UNION ALL
        SELECT 'os', COALESCE(os, 'Unknown'), COUNT(*),
               COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM win GROUP BY 2
        UNION ALL
        SELECT 'country', COALESCE(country, 'Unknown'), COUNT(*),
               COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM win GROUP BY 2
        UNION ALL
        SELECT 'referrer', COALESCE(referrer_host, 'Direct'), COUNT(*),
               COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM win GROUP BY 2
        UNION ALL
        SELECT 'language', COALESCE(language, 'Unknown'), COUNT(*),
               COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM win GROUP BY 2
    ),
    ranked AS (
        SELECT d, k, plays, listeners,
               ROW_NUMBER() OVER (PARTITION BY d ORDER BY plays DESC, k ASC) AS rn
        FROM dim
    )
    SELECT JSONB_OBJECT_AGG(d, entries) INTO v_result
    FROM (
        SELECT d, JSONB_AGG(JSONB_BUILD_OBJECT(
                     'key', k, 'plays', plays, 'listeners', listeners
                 ) ORDER BY plays DESC, k ASC) AS entries
        FROM ranked WHERE rn <= 8 GROUP BY d
    ) grouped;

    RETURN COALESCE(v_result, '{}'::JSONB);
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.get_user_role(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
BEGIN
    -- SECURITY DEFINER bypasses profiles_select_own's RLS, so without this
    -- check any authenticated caller could pass an arbitrary uuid here and
    -- enumerate which accounts are admin/super_admin. Every real call site
    -- (middleware, admin-guard, actions.ts) only ever queries its own id.
    IF p_user_id IS DISTINCT FROM auth.uid() AND NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role FROM podcast.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_role, 'user');
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.guard_profile_role()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF auth.uid() IS NOT NULL AND NOT podcast.is_admin() AND NEW.role IS DISTINCT FROM 'user' THEN
            NEW.role := 'user';
        END IF;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF NEW.role IS DISTINCT FROM OLD.role
       AND auth.uid() IS NOT NULL
       AND NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Only an administrator can change a role';
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_base     TEXT;
    v_username TEXT;
    v_suffix   INT := 0;
BEGIN
    v_base := REGEXP_REPLACE(
        LOWER(COALESCE(
            NULLIF(NEW.raw_user_meta_data->>'username', ''),
            NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
            SPLIT_PART(NEW.email, '@', 1)
        )),
        '[^a-z0-9_]', '', 'g'
    );
    IF v_base IS NULL OR LENGTH(v_base) < 3 THEN
        v_base := 'user' || SUBSTRING(REPLACE(NEW.id::TEXT, '-', ''), 1, 6);
    END IF;
    v_base := SUBSTRING(v_base, 1, 20);

    v_username := v_base;
    WHILE EXISTS (SELECT 1 FROM podcast.profiles WHERE LOWER(username) = v_username) LOOP
        v_suffix := v_suffix + 1;
        v_username := SUBSTRING(v_base, 1, 20 - LENGTH(v_suffix::TEXT)) || v_suffix::TEXT;
    END LOOP;

    INSERT INTO podcast.profiles (id, email, full_name, username, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        v_username,
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
        'user'
    );

    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

-- Ranked full-text search over published episodes.
--
-- An RPC rather than a PostgREST filter because ranking is the point:
-- ts_rank weights a title hit above a description hit (the setweight A/B/C/D
-- lanes on tracks.search_vector), and PostgREST cannot order by a computed
-- rank. websearch_to_tsquery is the parser that accepts what people actually
-- type -- quoted phrases, OR, and a leading minus to exclude -- without
-- raising on punctuation the way to_tsquery does.
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

CREATE OR REPLACE FUNCTION podcast.increment_play_count(p_track_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    UPDATE podcast.tracks
    SET play_count = play_count + 1
    WHERE id = p_track_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM podcast.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    );
END;
$function$
;

-- is_premium_user() removed: it referenced objects this schema never creates
-- and nothing in the app called it.
DROP FUNCTION IF EXISTS podcast.is_premium_user();

CREATE OR REPLACE FUNCTION podcast.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    -- Reads profiles.role, the same column is_admin() uses. This previously
    -- joined podcast.user_roles + podcast.roles, which migration 021 collapsed
    -- into that column and this schema never creates — so every call raised,
    -- and because profiles_delete_admin USES this function, deleting a profile
    -- always errored.
    RETURN EXISTS (
        SELECT 1
        FROM podcast.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'super_admin'
    );
END;
$function$
;

-- refresh_popular_tracks() removed: it referenced objects this schema never creates
-- and nothing in the app called it.
DROP FUNCTION IF EXISTS podcast.refresh_popular_tracks();

CREATE OR REPLACE FUNCTION podcast.update_comment_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE podcast.tracks SET comment_count = comment_count + 1 WHERE id = NEW.track_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE podcast.tracks SET comment_count = GREATEST(0, comment_count - 1) WHERE id = OLD.track_id;
    END IF;
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.update_favorite_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE podcast.tracks SET favorite_count = favorite_count + 1 WHERE id = NEW.track_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE podcast.tracks SET favorite_count = GREATEST(0, favorite_count - 1) WHERE id = OLD.track_id;
    END IF;
    RETURN NULL;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.update_playlist_stats()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE podcast.playlists
        SET
            track_count = track_count + 1,
            total_duration_seconds = total_duration_seconds + COALESCE(
                (SELECT duration_seconds FROM podcast.tracks WHERE id = NEW.track_id), 0
            )
        WHERE id = NEW.playlist_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE podcast.playlists
        SET
            track_count = GREATEST(0, track_count - 1),
            total_duration_seconds = GREATEST(0, total_duration_seconds - COALESCE(
                (SELECT duration_seconds FROM podcast.tracks WHERE id = OLD.track_id), 0
            ))
        WHERE id = OLD.playlist_id;
    END IF;
    RETURN NULL;
END;
$function$
;

-- Soft-deletes a playlist bypassing table RLS on purpose.
--
-- The `playlists_update_own` policy above expresses this exact same
-- authorization (owner OR admin) and was verified correct character-for-
-- character, with auth.uid()/is_admin() proven to resolve correctly in the
-- same transaction as a failing UPDATE against this table — the rejection was
-- not explainable by the policy text or the session context. This function
-- performs the identical check itself, then updates as its own owner, who is
-- exempt from RLS on this table (FORCE ROW LEVEL SECURITY is off). See
-- migration 033.
CREATE OR REPLACE FUNCTION podcast.delete_playlist(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = pg_catalog, podcast
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM podcast.playlists
        WHERE id = p_id AND (user_id = auth.uid() OR podcast.is_admin())
    ) THEN
        RAISE EXCEPTION 'Not authorized to delete this playlist' USING ERRCODE = '42501';
    END IF;

    UPDATE podcast.playlists SET deleted_at = now() WHERE id = p_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.user_has_permission(p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
BEGIN
    -- SECURITY DEFINER bypasses RLS; only the caller's own id (or an admin
    -- checking someone else's) may be queried here. Today's one call site
    -- (podcast_audio_admin_upload) always passes auth.uid(), so this only
    -- closes a latent enumeration path, it doesn't change real behavior.
    IF p_user_id IS DISTINCT FROM auth.uid() AND NOT podcast.is_admin() THEN
        RETURN FALSE;
    END IF;

    SELECT role INTO v_role FROM podcast.profiles WHERE id = p_user_id;
    IF v_role IS NULL THEN
        RETURN FALSE;
    END IF;
    IF v_role IN ('admin', 'super_admin') THEN
        RETURN TRUE;
    END IF;
    IF v_role = 'moderator' THEN
        RETURN p_permission IN ('tracks:create', 'tracks:update', 'comments:delete');
    END IF;
    RETURN p_permission IN ('tracks:read', 'playlists:manage', 'favorites:manage');
END;
$function$
;


-- =============================================================================
-- TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS trg_comment_count ON podcast.comments;
CREATE TRIGGER trg_comment_count AFTER INSERT OR DELETE ON podcast.comments FOR EACH ROW EXECUTE FUNCTION podcast.update_comment_count();
DROP TRIGGER IF EXISTS trg_comment_parent_check ON podcast.comments;
CREATE TRIGGER trg_comment_parent_check BEFORE INSERT OR UPDATE ON podcast.comments FOR EACH ROW EXECUTE FUNCTION podcast.check_comment_parent();
DROP TRIGGER IF EXISTS trg_comments_updated_at ON podcast.comments;
CREATE TRIGGER trg_comments_updated_at BEFORE UPDATE ON podcast.comments FOR EACH ROW EXECUTE FUNCTION podcast.handle_updated_at();
DROP TRIGGER IF EXISTS trg_favorite_count ON podcast.favorites;
CREATE TRIGGER trg_favorite_count AFTER INSERT OR DELETE ON podcast.favorites FOR EACH ROW EXECUTE FUNCTION podcast.update_favorite_count();
DROP TRIGGER IF EXISTS trg_play_events_updated_at ON podcast.play_events;
CREATE TRIGGER trg_play_events_updated_at BEFORE UPDATE ON podcast.play_events FOR EACH ROW EXECUTE FUNCTION podcast.handle_updated_at();
DROP TRIGGER IF EXISTS trg_playlist_stats ON podcast.playlist_tracks;
CREATE TRIGGER trg_playlist_stats AFTER INSERT OR DELETE ON podcast.playlist_tracks FOR EACH ROW EXECUTE FUNCTION podcast.update_playlist_stats();
DROP TRIGGER IF EXISTS trg_playlists_updated_at ON podcast.playlists;
CREATE TRIGGER trg_playlists_updated_at BEFORE UPDATE ON podcast.playlists FOR EACH ROW EXECUTE FUNCTION podcast.handle_updated_at();
DROP TRIGGER IF EXISTS trg_guard_profile_role ON podcast.profiles;
CREATE TRIGGER trg_guard_profile_role BEFORE INSERT OR UPDATE ON podcast.profiles FOR EACH ROW EXECUTE FUNCTION podcast.guard_profile_role();
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON podcast.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON podcast.profiles FOR EACH ROW EXECUTE FUNCTION podcast.handle_updated_at();
DROP TRIGGER IF EXISTS trg_show_updated_at ON podcast.show;
CREATE TRIGGER trg_show_updated_at BEFORE UPDATE ON podcast.show FOR EACH ROW EXECUTE FUNCTION podcast.handle_updated_at();
DROP TRIGGER IF EXISTS trg_tracks_updated_at ON podcast.tracks;
CREATE TRIGGER trg_tracks_updated_at BEFORE UPDATE ON podcast.tracks FOR EACH ROW EXECUTE FUNCTION podcast.handle_updated_at();

-- Signup trigger on auth.users. Uniquely named so it coexists with any other
-- app's trigger on that table instead of replacing it.
DROP TRIGGER IF EXISTS on_auth_user_created_podcast ON auth.users;
CREATE TRIGGER on_auth_user_created_podcast AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION podcast.handle_new_user();


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE podcast.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.play_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.show ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast.tracks ENABLE ROW LEVEL SECURITY;

-- The show record is public by design: it is what the homepage renders.
DROP POLICY IF EXISTS show_select ON podcast.show;
CREATE POLICY show_select ON podcast.show
    AS PERMISSIVE
    FOR SELECT TO public
    USING (true);

DROP POLICY IF EXISTS show_manage_admin ON podcast.show;
CREATE POLICY show_manage_admin ON podcast.show
    AS PERMISSIVE
    FOR ALL TO public
    USING (podcast.is_admin());

DROP POLICY IF EXISTS comments_delete_own ON podcast.comments;
CREATE POLICY comments_delete_own ON podcast.comments
    AS PERMISSIVE
    FOR DELETE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS comments_insert_own ON podcast.comments;
CREATE POLICY comments_insert_own ON podcast.comments
    AS PERMISSIVE
    FOR INSERT TO public
    WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM podcast.tracks t
  WHERE ((t.id = comments.track_id) AND (t.status = 'published'::text) AND (t.deleted_at IS NULL))))));

DROP POLICY IF EXISTS comments_select ON podcast.comments;
CREATE POLICY comments_select ON podcast.comments
    AS PERMISSIVE
    FOR SELECT TO public
    USING (((EXISTS ( SELECT 1
   FROM podcast.tracks t
  WHERE ((t.id = comments.track_id) AND (t.status = 'published'::text) AND (t.deleted_at IS NULL)))) OR (user_id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS comments_update_own ON podcast.comments;
CREATE POLICY comments_update_own ON podcast.comments
    AS PERMISSIVE
    FOR UPDATE TO public
    USING ((user_id = auth.uid()))
    WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM podcast.tracks t
  WHERE ((t.id = comments.track_id) AND (t.status = 'published'::text) AND (t.deleted_at IS NULL))))));

DROP POLICY IF EXISTS favorites_own ON podcast.favorites;
CREATE POLICY favorites_own ON podcast.favorites
    AS PERMISSIVE
    FOR ALL TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS play_events_select_admin ON podcast.play_events;
CREATE POLICY play_events_select_admin ON podcast.play_events
    AS PERMISSIVE
    FOR SELECT TO public
    USING (podcast.is_admin());

DROP POLICY IF EXISTS playlist_tracks_manage_own ON podcast.playlist_tracks;
CREATE POLICY playlist_tracks_manage_own ON podcast.playlist_tracks
    AS PERMISSIVE
    FOR ALL TO public
    USING (((EXISTS ( SELECT 1
   FROM podcast.playlists p
  WHERE ((p.id = playlist_tracks.playlist_id) AND (p.user_id = auth.uid())))) OR podcast.is_admin()))
    WITH CHECK ((podcast.is_admin() OR ((EXISTS ( SELECT 1
   FROM podcast.playlists p
  WHERE ((p.id = playlist_tracks.playlist_id) AND (p.user_id = auth.uid())))) AND (EXISTS ( SELECT 1
   FROM podcast.tracks t
  WHERE ((t.id = playlist_tracks.track_id) AND (t.status = 'published'::text) AND (t.deleted_at IS NULL)))))));

DROP POLICY IF EXISTS playlist_tracks_select ON podcast.playlist_tracks;
CREATE POLICY playlist_tracks_select ON podcast.playlist_tracks
    AS PERMISSIVE
    FOR SELECT TO public
    USING (((EXISTS ( SELECT 1
   FROM podcast.playlists p
  WHERE ((p.id = playlist_tracks.playlist_id) AND ((p.user_id = auth.uid()) OR (p.is_public = true))))) OR podcast.is_admin()));

DROP POLICY IF EXISTS playlists_delete_own ON podcast.playlists;
CREATE POLICY playlists_delete_own ON podcast.playlists
    AS PERMISSIVE
    FOR DELETE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS playlists_insert_own ON podcast.playlists;
CREATE POLICY playlists_insert_own ON podcast.playlists
    AS PERMISSIVE
    FOR INSERT TO public
    WITH CHECK ((user_id = auth.uid()));

DROP POLICY IF EXISTS playlists_select ON podcast.playlists;
CREATE POLICY playlists_select ON podcast.playlists
    AS PERMISSIVE
    FOR SELECT TO public
    USING (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR (is_public = true) OR podcast.is_admin())));

-- Deliberately no WITH CHECK: Postgres then reuses USING for the new-row check.
-- An earlier version of this policy carried `deleted_at IS NULL` in its check,
-- which made soft-deleting a playlist violate the very policy meant to allow it
-- ("new row violates row-level security policy"). See migration 031.
DROP POLICY IF EXISTS playlists_update_own ON podcast.playlists;
CREATE POLICY playlists_update_own ON podcast.playlists
    AS PERMISSIVE
    FOR UPDATE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS profiles_delete_admin ON podcast.profiles;
CREATE POLICY profiles_delete_admin ON podcast.profiles
    AS PERMISSIVE
    FOR DELETE TO public
    USING (podcast.is_super_admin());

DROP POLICY IF EXISTS profiles_insert ON podcast.profiles;
CREATE POLICY profiles_insert ON podcast.profiles
    AS PERMISSIVE
    FOR INSERT TO public
    WITH CHECK ((id = auth.uid()));

DROP POLICY IF EXISTS profiles_select_own ON podcast.profiles;
CREATE POLICY profiles_select_own ON podcast.profiles
    AS PERMISSIVE
    FOR SELECT TO public
    USING (((id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS profiles_update_own ON podcast.profiles;
CREATE POLICY profiles_update_own ON podcast.profiles
    AS PERMISSIVE
    FOR UPDATE TO public
    USING (((id = auth.uid()) OR podcast.is_admin()));

DROP POLICY IF EXISTS tracks_delete_admin ON podcast.tracks;
CREATE POLICY tracks_delete_admin ON podcast.tracks
    AS PERMISSIVE
    FOR DELETE TO public
    USING (podcast.is_admin());

-- Without these two, RLS denies every INSERT and UPDATE on tracks, so
-- publishing, editing, changing status and soft-deleting an episode all fail
-- with "new row violates row-level security policy" (migration 029).
DROP POLICY IF EXISTS tracks_insert_admin ON podcast.tracks;
CREATE POLICY tracks_insert_admin ON podcast.tracks
    AS PERMISSIVE
    FOR INSERT TO public
    WITH CHECK (podcast.is_admin());

-- USING picks which rows may be targeted, WITH CHECK what they may become.
DROP POLICY IF EXISTS tracks_update_admin ON podcast.tracks;
CREATE POLICY tracks_update_admin ON podcast.tracks
    AS PERMISSIVE
    FOR UPDATE TO public
    USING (podcast.is_admin())
    WITH CHECK (podcast.is_admin());

DROP POLICY IF EXISTS tracks_select_published ON podcast.tracks;
CREATE POLICY tracks_select_published ON podcast.tracks
    AS PERMISSIVE
    FOR SELECT TO public
    USING ((((status = 'published'::text) AND (deleted_at IS NULL)) OR podcast.is_admin()));



-- =============================================================================
-- GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA podcast TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA podcast TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA podcast TO anon, authenticated, service_role;
-- Explicit despite the blanket grant above, matching the pattern already used
-- for search_tracks/keywords_text: an upgraded database should not depend on
-- a future default surviving unchanged.
GRANT EXECUTE ON FUNCTION podcast.delete_playlist(uuid) TO authenticated, service_role;
-- The blanket GRANT above only covers functions that existed when it ran, so
-- anything added later needs saying explicitly. These four gate on is_admin()
-- internally, so authenticated is the correct grantee — anon has no reason to
-- hold EXECUTE on them at all.
GRANT EXECUTE ON FUNCTION podcast.get_admin_dashboard(integer)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION podcast.get_admin_timeseries(integer)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION podcast.get_admin_track_stats(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION podcast.get_admin_reach(integer)       TO authenticated, service_role;

-- Security: a user must never be able to promote themselves.
-- A column-level REVOKE cannot subtract from a table-level GRANT, so the
-- table-wide UPDATE is dropped and only the safe columns granted back
-- (migrations 023 / 025 / 026).
REVOKE UPDATE ON podcast.profiles FROM authenticated;
REVOKE UPDATE ON podcast.profiles FROM anon;
GRANT UPDATE (full_name, avatar_url, username, updated_at) ON podcast.profiles TO authenticated;
GRANT UPDATE ON podcast.profiles TO service_role;


-- =============================================================================
-- SUPABASE STORAGE
-- =============================================================================
-- Buckets live outside the podcast schema, so they are declared explicitly.
-- Ids are prefixed "podcast-" so they cannot collide with another app's buckets.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('podcast-audio',      'podcast-audio',      FALSE, 209715200,
        ARRAY['audio/mpeg','audio/mp3','audio/ogg','audio/wav','audio/aac','audio/flac']),
    ('podcast-images',     'podcast-images',     TRUE,  5242880,
        ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']),
    ('podcast-avatars',    'podcast-avatars',    TRUE,  5242880,
        ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']),
    ('podcast-thumbnails', 'podcast-thumbnails', TRUE,  5242880,
        ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif'])
ON CONFLICT (id) DO NOTHING;

-- Object policies: admins upload, the public buckets are world-readable.
DROP POLICY IF EXISTS "podcast_audio_admin_delete" ON storage.objects;
CREATE POLICY "podcast_audio_admin_delete" ON storage.objects
    AS PERMISSIVE
    FOR DELETE TO authenticated
    USING (((bucket_id = 'podcast-audio'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS "podcast_audio_admin_upload" ON storage.objects;
CREATE POLICY "podcast_audio_admin_upload" ON storage.objects
    AS PERMISSIVE
    FOR INSERT TO authenticated
    WITH CHECK (((bucket_id = 'podcast-audio'::text) AND podcast.user_has_permission(auth.uid(), 'tracks:create'::text)));

-- Playback never reads this bucket directly — every play goes through
-- /api/stream/[id], which fetches the track via the cookie-scoped client
-- (RLS: published-only for non-admins) and only then mints a service-role
-- signed URL (lib/audio-storage.ts). A blanket "any authenticated user" read
-- policy here bypassed that publish-status gate entirely: any signed-in
-- visitor could read ANY object in this bucket, including unpublished drafts,
-- by calling Storage directly instead of the app route. Nothing legitimate
-- needs this, so it is now admin-only like the sibling delete/upload policies.
DROP POLICY IF EXISTS "podcast_audio_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_admin_read" ON storage.objects;
CREATE POLICY "podcast_audio_admin_read" ON storage.objects
    AS PERMISSIVE
    FOR SELECT TO authenticated
    USING (((bucket_id = 'podcast-audio'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS "podcast_avatars_delete_own" ON storage.objects;
CREATE POLICY "podcast_avatars_delete_own" ON storage.objects
    AS PERMISSIVE
    FOR DELETE TO authenticated
    USING (((bucket_id = 'podcast-avatars'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR podcast.is_admin())));

DROP POLICY IF EXISTS "podcast_avatars_public_read" ON storage.objects;
CREATE POLICY "podcast_avatars_public_read" ON storage.objects
    AS PERMISSIVE
    FOR SELECT TO public
    USING ((bucket_id = 'podcast-avatars'::text));

DROP POLICY IF EXISTS "podcast_avatars_update_own" ON storage.objects;
CREATE POLICY "podcast_avatars_update_own" ON storage.objects
    AS PERMISSIVE
    FOR UPDATE TO authenticated
    USING (((bucket_id = 'podcast-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "podcast_avatars_upload_own" ON storage.objects;
CREATE POLICY "podcast_avatars_upload_own" ON storage.objects
    AS PERMISSIVE
    FOR INSERT TO authenticated
    WITH CHECK (((bucket_id = 'podcast-avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

DROP POLICY IF EXISTS "podcast_images_admin_delete" ON storage.objects;
CREATE POLICY "podcast_images_admin_delete" ON storage.objects
    AS PERMISSIVE
    FOR DELETE TO authenticated
    USING (((bucket_id = 'podcast-images'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS "podcast_images_admin_upload" ON storage.objects;
CREATE POLICY "podcast_images_admin_upload" ON storage.objects
    AS PERMISSIVE
    FOR INSERT TO authenticated
    WITH CHECK (((bucket_id = 'podcast-images'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS "podcast_images_public_read" ON storage.objects;
CREATE POLICY "podcast_images_public_read" ON storage.objects
    AS PERMISSIVE
    FOR SELECT TO public
    USING ((bucket_id = 'podcast-images'::text));

DROP POLICY IF EXISTS "podcast_thumbnails_admin_delete" ON storage.objects;
CREATE POLICY "podcast_thumbnails_admin_delete" ON storage.objects
    AS PERMISSIVE
    FOR DELETE TO authenticated
    USING (((bucket_id = 'podcast-thumbnails'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS "podcast_thumbnails_admin_upload" ON storage.objects;
CREATE POLICY "podcast_thumbnails_admin_upload" ON storage.objects
    AS PERMISSIVE
    FOR INSERT TO authenticated
    WITH CHECK (((bucket_id = 'podcast-thumbnails'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS "podcast_thumbnails_public_read" ON storage.objects;
CREATE POLICY "podcast_thumbnails_public_read" ON storage.objects
    AS PERMISSIVE
    FOR SELECT TO public
    USING ((bucket_id = 'podcast-thumbnails'::text));



-- =============================================================================
-- EXPOSE THE SCHEMA TO THE API (PostgREST)
-- =============================================================================
-- Without this the tables exist but the app sees nothing: PostgREST only
-- serves schemas on its exposed list.

ALTER DEFAULT PRIVILEGES IN SCHEMA podcast GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA podcast GRANT ALL ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA podcast GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

DO $$
DECLARE
  cur text := NULL;
  item text;
  newval text;
BEGIN
  FOR item IN
    SELECT unnest(s.setconfig) FROM pg_db_role_setting s
    JOIN pg_roles r ON r.oid = s.setrole WHERE r.rolname = 'authenticator'
  LOOP
    IF item LIKE 'pgrst.db_schemas=%' THEN cur := split_part(item, '=', 2); END IF;
  END LOOP;

  IF cur IS NULL THEN newval := 'public, storage, graphql_public, podcast';
  ELSIF position('podcast' IN cur) > 0 THEN newval := cur;
  ELSE newval := cur || ', podcast';
  END IF;

  EXECUTE format('ALTER ROLE authenticator SET pgrst.db_schemas = %L', newval);
  RAISE NOTICE 'PostgREST exposed schemas: %', newval;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not set exposed schemas automatically (%). Add "podcast" under Dashboard -> Settings -> API -> Exposed schemas.', SQLERRM;
END $$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';


-- =============================================================================
-- SEED DATA
-- =============================================================================
-- The single show row. Left blank on purpose: the app falls back to
-- lib/brand.ts until an admin fills this in at /admin/show, so a fresh install
-- renders correctly with no manual SQL.

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

INSERT INTO podcast.show (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- Version history, informational only. Nothing reads this table — it exists so
-- a human can tell which revision of the schema a database was built from.
INSERT INTO podcast.schema_migrations (version) VALUES
    ('000_schema'),
    ('001_initial_schema'),
    ('002_content'),
    ('003_user_activity'),
    ('004_subscriptions'),
    ('005_notifications'),
    ('006_analytics'),
    ('007_settings'),
    ('008_functions'),
    ('009_views'),
    ('010_rls_policies'),
    ('011_indexes'),
    ('012_storage_policies'),
    ('013_comments'),
    ('014_branding'),
    ('015_expose'),
    ('016_podcast_categories'),
    ('017_meditation_categories'),
    ('018_usernames'),
    ('019_playlist_slugs'),
    ('020_comment_replies'),
    ('021_consolidate_schema'),
    ('022_play_events'),
    ('023_lock_role_column'),
    ('024_drop_search_indexes'),
    ('025_fix_role_column_grant'),
    ('026_guard_role_on_insert'),
    ('027_show_and_platform_links'),
    ('028_playlists_only'),
    ('029_tracks_admin_write_policies'),
    ('030_seo_metadata_and_search'),
    ('031_playlist_soft_delete_policy'),
    ('032_verify_playlist_delete_policy'),
    ('033_playlist_delete_via_rpc'),
    ('034_security_audit_hardening'),
    ('035_analytics_reach_and_dashboard')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- AFTER RUNNING THIS FILE
-- =============================================================================
-- 1. Check Dashboard -> Settings -> API -> Exposed schemas lists "podcast".
--    The DO block sets it automatically, but some projects restrict ALTER ROLE.
-- 2. Create the first admin (credentials are never stored in .env):
--      pnpm seed:admin -- --email you@example.com --password '...'
-- 3. Set ADMIN_VERIFICATION_CODE in .env — admin sign-in requires it.
-- =============================================================================
