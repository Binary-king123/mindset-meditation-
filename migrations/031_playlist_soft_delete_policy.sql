-- =============================================================================
-- 031 — let an admin soft-delete a playlist
-- =============================================================================
-- Symptom: pressing Delete on a playlist in /admin returned
--   "new row violates row-level security policy for table \"playlists\""
--
-- Cause: the UPDATE policy live on this database carries a WITH CHECK that
-- requires `deleted_at IS NULL`. Soft-deleting sets `deleted_at`, so the new row
-- fails its own update policy — the one operation the policy exists to permit is
-- the one it forbids. Probed one column at a time: title, description,
-- is_public and thumbnail_url all update fine; only `deleted_at` is rejected.
--
-- Why it survived until now: policies were last defined by 010_rls_policies, and
-- every migration since (including 029 and 030) left them alone. fullschema.sql
-- already carries the correct definitions, but a database upgraded through the
-- delta path never ran them — so a fresh install and this database disagreed.
-- This file closes that gap; the four policies below are byte-identical to the
-- ones in fullschema.sql.
--
-- Idempotent and transactional: safe to run more than once.
-- =============================================================================

BEGIN;

-- Drop every existing policy on podcast.playlists by whatever name it carries.
-- The offending policy's name is not knowable from here, and a stale PERMISSIVE
-- policy left in place would keep granting access we are trying to define
-- precisely — while a stale RESTRICTIVE one would keep denying it. Clearing the
-- table's policies and rebuilding the canonical set is the only way to converge
-- on a known state from an unknown one.
DO $strip_playlist_policies$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'podcast' AND tablename = 'playlists'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON podcast.playlists', pol.policyname);
    END LOOP;
END
$strip_playlist_policies$;

-- Soft-deleted playlists stay hidden from listeners. Note this also hides them
-- from admins, which is deliberate: "deleted" should mean gone from the UI, and
-- there is no restore screen for it to feed.
CREATE POLICY playlists_select ON podcast.playlists
    AS PERMISSIVE
    FOR SELECT TO public
    USING (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR (is_public = true) OR podcast.is_admin())));

CREATE POLICY playlists_insert_own ON podcast.playlists
    AS PERMISSIVE
    FOR INSERT TO public
    WITH CHECK ((user_id = auth.uid()));

-- No mention of deleted_at, which is the fix. With no explicit WITH CHECK,
-- Postgres reuses USING for the new-row check, so an admin may set any column
-- including deleted_at.
CREATE POLICY playlists_update_own ON podcast.playlists
    AS PERMISSIVE
    FOR UPDATE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

CREATE POLICY playlists_delete_own ON podcast.playlists
    AS PERMISSIVE
    FOR DELETE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

INSERT INTO podcast.schema_migrations (version)
VALUES ('031_playlist_soft_delete_policy')
ON CONFLICT DO NOTHING;

COMMIT;

-- Verify: as a signed-in admin, this must return 1 rather than raise.
--   UPDATE podcast.playlists SET deleted_at = now() WHERE slug = 'some-slug';
--   -- then undo:
--   UPDATE podcast.playlists SET deleted_at = NULL  WHERE slug = 'some-slug';
