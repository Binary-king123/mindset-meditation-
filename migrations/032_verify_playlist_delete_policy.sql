-- =============================================================================
-- 032 — force-reapply the playlists RLS policies and prove the fix in-place
-- =============================================================================
-- Context: migration 031 was reported as run — `schema_migrations` shows it —
-- yet deleting a playlist still raises the exact same error:
--   "new row violates row-level security policy for table \"playlists\""
--
-- Verified directly against this database with a fresh admin session, bypassing
-- the app entirely: title/description/is_public all update fine; only setting
-- `deleted_at` is rejected. That is the identical symptom 031 was meant to fix.
-- Since 031's DROP/CREATE statements and its own version-row insert share one
-- transaction, the version row could only be there if those statements had
-- already run without error — so either something recreated a stale policy
-- afterwards (a dashboard "RLS policy" editor session is the usual cause), or
-- the run silently didn't do what it looked like it did. Rather than guess
-- further, this file (a) unconditionally rebuilds the four policies again —
-- safe to run any number of times — and (b) proves it worked by actually
-- performing the failing operation, as an authenticated admin, inside a
-- transaction that is always rolled back. If the policy is still wrong, THIS
-- FILE ITSELF will fail with the same error, right here in the SQL editor,
-- instead of leaving it to be rediscovered from the app.
-- =============================================================================

BEGIN;

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

CREATE POLICY playlists_select ON podcast.playlists
    AS PERMISSIVE
    FOR SELECT TO public
    USING (((deleted_at IS NULL) AND ((user_id = auth.uid()) OR (is_public = true) OR podcast.is_admin())));

CREATE POLICY playlists_insert_own ON podcast.playlists
    AS PERMISSIVE
    FOR INSERT TO public
    WITH CHECK ((user_id = auth.uid()));

-- Deliberately no WITH CHECK: Postgres then reuses USING for the new-row
-- check. This is the line that matters — it must never mention deleted_at.
CREATE POLICY playlists_update_own ON podcast.playlists
    AS PERMISSIVE
    FOR UPDATE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

CREATE POLICY playlists_delete_own ON podcast.playlists
    AS PERMISSIVE
    FOR DELETE TO public
    USING (((user_id = auth.uid()) OR podcast.is_admin()));

INSERT INTO podcast.schema_migrations (version)
VALUES ('032_verify_playlist_delete_policy')
ON CONFLICT DO NOTHING;

COMMIT;

-- -----------------------------------------------------------------------------
-- Self-test — the exact operation the admin panel performs on Delete,
-- run as an authenticated admin the same way PostgREST would, then rolled
-- back either way. This is Supabase's own documented technique for testing
-- RLS from the SQL editor: SET ROLE plus the request.jwt claims a real
-- request would carry. Nothing here is left behind — a ROLLBACK, not COMMIT,
-- closes it regardless of outcome.
-- -----------------------------------------------------------------------------
BEGIN;

  INSERT INTO podcast.playlists (user_id, title, slug, is_public)
  SELECT id, '__rls_verify__', '__rls_verify__', true
  FROM podcast.profiles
  WHERE role IN ('admin', 'super_admin')
  LIMIT 1;

  -- Both GUC forms are set because auth.uid() reads whichever the installed
  -- Supabase auth schema version checks first.
  SELECT set_config(
    'request.jwt.claim.sub',
    (SELECT user_id::text FROM podcast.playlists WHERE slug = '__rls_verify__'),
    true
  );
  SELECT set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', (SELECT user_id FROM podcast.playlists WHERE slug = '__rls_verify__'),
      'role', 'authenticated'
    )::text,
    true
  );

  SET ROLE authenticated;

  -- If this raises "new row violates row-level security policy", the policy
  -- above did not take effect and the fix needs a different explanation than
  -- "just re-run 031". If it completes silently, the fix is confirmed live.
  UPDATE podcast.playlists SET deleted_at = now() WHERE slug = '__rls_verify__';

RESET ROLE;
ROLLBACK;
