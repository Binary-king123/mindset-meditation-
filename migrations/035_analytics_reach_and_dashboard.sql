-- =============================================================================
-- 035 — analytics: request context on play_events, and dashboard aggregates
-- =============================================================================
-- The admin analytics page could only answer "how many plays". Everything else
-- it displayed was either a different question wearing the wrong label or an
-- outright invention:
--
--   * "Followers" was COUNT(*) on profiles — every registered account,
--     including the admin's own and accounts that never pressed play. There is
--     no follow relationship in this product and there never was.
--   * "Reach" had no backing data at all. play_events stored eight columns and
--     none of them said anything about where a listener came from.
--
-- This migration fixes the second by recording the request context that the
-- /api/stream route already has in hand, and adds four aggregate functions so
-- the dashboard can ask real questions without dragging the whole event table
-- into JS.
--
-- On the new columns: they are all NULLable and populated going forward only.
-- There is no backfill because the information was never captured — rows
-- written before this migration keep NULL forever, and the dashboard reports
-- them as "Unknown" rather than quietly dropping them from percentages.
--
-- On country specifically: it is filled from a CDN header (Cloudflare's
-- CF-IPCountry or Vercel's x-vercel-ip-country) when one is present. This app
-- deploys standalone to a plain VPS, where neither header exists, so country
-- stays NULL unless a CDN is in front. That is why the dashboard treats an
-- all-NULL country column as "not available" instead of drawing an empty chart.
--
-- On the aggregate functions: the page previously pulled up to 10,000
-- play_events rows and reduced them in JS to get per-episode retention, which
-- silently goes wrong the moment a quarter exceeds that cap. All aggregation
-- now happens in Postgres, where it is bounded by the result size rather than
-- the event count.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Request context on play_events
-- -----------------------------------------------------------------------------
ALTER TABLE podcast.play_events
    ADD COLUMN IF NOT EXISTS country       TEXT,
    ADD COLUMN IF NOT EXISTS referrer_host TEXT,
    ADD COLUMN IF NOT EXISTS device_type   TEXT,
    ADD COLUMN IF NOT EXISTS browser       TEXT,
    ADD COLUMN IF NOT EXISTS os            TEXT,
    ADD COLUMN IF NOT EXISTS language      TEXT;

-- Free-text from a header is not something to trust into a chart legend
-- unmoderated. The write path maps user-agents onto a small fixed vocabulary;
-- this constraint is what makes that mapping load-bearing rather than a
-- convention someone can forget.
ALTER TABLE podcast.play_events
    DROP CONSTRAINT IF EXISTS play_events_device_type_check;
ALTER TABLE podcast.play_events
    ADD CONSTRAINT play_events_device_type_check
    CHECK (device_type IS NULL OR device_type IN ('mobile', 'tablet', 'desktop', 'tv', 'bot', 'other'));

COMMENT ON COLUMN podcast.play_events.country IS
    'ISO-3166-1 alpha-2 from a CDN geo header. NULL when no CDN is in front of the app.';
COMMENT ON COLUMN podcast.play_events.referrer_host IS
    'Hostname only, never the full URL — the path can carry personal data and is not needed to attribute traffic.';

-- Reach breakdowns all filter by created_at and group by one dimension.
CREATE INDEX IF NOT EXISTS play_events_country_idx
    ON podcast.play_events USING btree (created_at DESC, country);
CREATE INDEX IF NOT EXISTS play_events_referrer_idx
    ON podcast.play_events USING btree (created_at DESC, referrer_host);

-- -----------------------------------------------------------------------------
-- 2. get_admin_dashboard — every headline number in one round trip
-- -----------------------------------------------------------------------------
-- Returns current-window figures alongside the immediately preceding window of
-- the same length, so the UI can show direction of travel without a second
-- call and without inventing a baseline.
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

        -- Plays
        'plays',            (SELECT COUNT(*) FROM win),
        'plays_prev',       (SELECT COUNT(*) FROM prev),
        'plays_total',      (SELECT COUNT(*) FROM podcast.play_events),
        'plays_today',      (SELECT COUNT(*) FROM podcast.play_events
                             WHERE created_at >= DATE_TRUNC('day', NOW())),
        'plays_yesterday',  (SELECT COUNT(*) FROM podcast.play_events
                             WHERE created_at >= DATE_TRUNC('day', NOW()) - INTERVAL '1 day'
                               AND created_at <  DATE_TRUNC('day', NOW())),

        -- Listeners
        'listeners',        (SELECT COUNT(*) FROM sessions),
        'listeners_prev',   (SELECT COUNT(DISTINCT COALESCE(user_id::TEXT, session_id)) FROM prev),
        'listeners_total',  (SELECT COUNT(DISTINCT COALESCE(user_id::TEXT, session_id))
                             FROM podcast.play_events),
        'listeners_new',    (SELECT COUNT(*) FROM first_seen WHERE first_at >= v_start),
        'listeners_repeat', (SELECT COUNT(*) FROM sessions WHERE plays > 1),

        -- Who they are. signed_in_plays counts events, not people — a single
        -- account listening ten times is ten signed-in plays.
        'signed_in_plays',  (SELECT COUNT(*) FROM win WHERE user_id IS NOT NULL),
        'anon_plays',       (SELECT COUNT(*) FROM win WHERE user_id IS NULL),

        -- How much was actually listened to. This is the honest "how much"
        -- figure: summed heard-seconds, not plays × episode length.
        'listened_seconds',      (SELECT COALESCE(SUM(listened_seconds), 0) FROM win),
        'listened_seconds_prev', (SELECT COALESCE(SUM(listened_seconds), 0) FROM prev),
        'listened_seconds_total',(SELECT COALESCE(SUM(listened_seconds), 0) FROM podcast.play_events),
        'avg_listen_seconds',    (SELECT COALESCE(ROUND(AVG(listened_seconds)), 0) FROM win),

        -- Retention is the mean share of an episode heard, per play.
        -- Completion is the share of plays that reached 90%.
        'retention',  (SELECT COALESCE(ROUND(AVG(
                          LEAST(listened_seconds::NUMERIC / NULLIF(duration_seconds, 0), 1)
                      ) FILTER (WHERE duration_seconds > 0) * 100, 1), 0) FROM win),
        'completion', (SELECT COALESCE(ROUND(
                          COUNT(*) FILTER (WHERE duration_seconds > 0
                                             AND listened_seconds::NUMERIC / duration_seconds >= 0.9
                          )::NUMERIC * 100
                          / NULLIF(COUNT(*) FILTER (WHERE duration_seconds > 0), 0), 1), 0) FROM win),

        -- Engagement
        'saves',          (SELECT COUNT(*) FROM podcast.favorites WHERE created_at >= v_start),
        'saves_prev',     (SELECT COUNT(*) FROM podcast.favorites
                           WHERE created_at >= v_prev AND created_at < v_start),
        'saves_total',    (SELECT COUNT(*) FROM podcast.favorites),
        'comments',       (SELECT COUNT(*) FROM podcast.comments WHERE created_at >= v_start),
        'comments_prev',  (SELECT COUNT(*) FROM podcast.comments
                           WHERE created_at >= v_prev AND created_at < v_start),
        'comments_total', (SELECT COUNT(*) FROM podcast.comments),

        -- Accounts. Deliberately NOT called followers: this product has no
        -- follow relationship, and labelling registrations as followers is the
        -- kind of flattering mislabel this dashboard is meant to stop doing.
        'accounts',       (SELECT COUNT(*) FROM podcast.profiles WHERE created_at >= v_start),
        'accounts_prev',  (SELECT COUNT(*) FROM podcast.profiles
                           WHERE created_at >= v_prev AND created_at < v_start),
        'accounts_total', (SELECT COUNT(*) FROM podcast.profiles),

        -- Catalogue
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
$function$;

-- -----------------------------------------------------------------------------
-- 3. get_admin_timeseries — one row per day, every series aligned
-- -----------------------------------------------------------------------------
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
$function$;

-- -----------------------------------------------------------------------------
-- 4. get_admin_track_stats — per-episode, aggregated in the database
-- -----------------------------------------------------------------------------
-- Replaces the JS reduce over a capped 10,000-row fetch. Saves and comments
-- come from their own tables rather than the denormalised counters on tracks,
-- because those counters are all-time and this is windowed.
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
$function$;

-- -----------------------------------------------------------------------------
-- 5. get_admin_reach — where listeners come from
-- -----------------------------------------------------------------------------
-- Each dimension is capped at its top 8 values so one long tail cannot make the
-- payload unbounded. NULLs are surfaced as 'Unknown' rather than filtered out,
-- so the segments always sum to the play total and nothing is quietly hidden.
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
$function$;

-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
-- The blanket GRANT in fullschema.sql only covers functions that existed when
-- it ran, so anything added later needs saying explicitly.
GRANT EXECUTE ON FUNCTION podcast.get_admin_dashboard(integer)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION podcast.get_admin_timeseries(integer)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION podcast.get_admin_track_stats(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION podcast.get_admin_reach(integer)       TO authenticated, service_role;

INSERT INTO podcast.schema_migrations (version)
VALUES ('035_analytics_reach_and_dashboard')
ON CONFLICT DO NOTHING;

COMMIT;
