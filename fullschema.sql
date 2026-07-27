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
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

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


-- =============================================================================
-- CONSTRAINTS
-- =============================================================================
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
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_track_id_fkey;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_user_id_fkey;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE CASCADE;
ALTER TABLE podcast.comments DROP CONSTRAINT IF EXISTS comments_parent_id_fkey;
ALTER TABLE podcast.comments ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES podcast.comments(id) ON DELETE CASCADE;
ALTER TABLE podcast.favorites DROP CONSTRAINT IF EXISTS favorites_user_id_fkey;
ALTER TABLE podcast.favorites ADD CONSTRAINT favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE CASCADE;
ALTER TABLE podcast.favorites DROP CONSTRAINT IF EXISTS favorites_track_id_fkey;
ALTER TABLE podcast.favorites ADD CONSTRAINT favorites_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_track_id_fkey;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.play_events DROP CONSTRAINT IF EXISTS play_events_user_id_fkey;
ALTER TABLE podcast.play_events ADD CONSTRAINT play_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE SET NULL;
ALTER TABLE podcast.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_track_id_fkey;
ALTER TABLE podcast.playlist_tracks ADD CONSTRAINT playlist_tracks_track_id_fkey FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE CASCADE;
ALTER TABLE podcast.playlist_tracks DROP CONSTRAINT IF EXISTS playlist_tracks_playlist_id_fkey;
ALTER TABLE podcast.playlist_tracks ADD CONSTRAINT playlist_tracks_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES podcast.playlists(id) ON DELETE CASCADE;
ALTER TABLE podcast.playlists DROP CONSTRAINT IF EXISTS playlists_user_id_fkey;
ALTER TABLE podcast.playlists ADD CONSTRAINT playlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES podcast.profiles(id) ON DELETE CASCADE;
ALTER TABLE podcast.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
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

CREATE OR REPLACE FUNCTION podcast.get_user_role(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
BEGIN
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

CREATE OR REPLACE FUNCTION podcast.is_premium_user()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM podcast.subscriptions s
        WHERE s.user_id = auth.uid()
          AND s.plan != 'free'
          AND s.status IN ('active', 'trial')
          AND (s.ends_at IS NULL OR s.ends_at > NOW())
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.is_super_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM podcast.user_roles ur
        JOIN podcast.roles r ON ur.role_id = r.id
        WHERE ur.user_id = auth.uid()
          AND r.name = 'super_admin'
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION podcast.refresh_popular_tracks()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY podcast.popular_tracks;
END;
$function$
;

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

CREATE OR REPLACE FUNCTION podcast.user_has_permission(p_user_id uuid, p_permission text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
BEGIN
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
    USING ((user_id = auth.uid()));

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
  WHERE ((p.id = playlist_tracks.playlist_id) AND (p.user_id = auth.uid())))) OR podcast.is_admin()));

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

DROP POLICY IF EXISTS "podcast_audio_authenticated_read" ON storage.objects;
CREATE POLICY "podcast_audio_authenticated_read" ON storage.objects
    AS PERMISSIVE
    FOR SELECT TO authenticated
    USING ((bucket_id = 'podcast-audio'::text));

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
    ('029_tracks_admin_write_policies')
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
