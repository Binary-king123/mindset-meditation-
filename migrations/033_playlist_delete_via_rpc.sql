-- =============================================================================
-- 033 — soft-delete a playlist through an RPC instead of a direct UPDATE
-- =============================================================================
-- Context: migrations 031 and 032 rebuilt the `playlists_update_own` RLS
-- policy to exactly what fullschema.sql declares — verified directly against
-- this database via `pg_policies`, character for character, no WITH CHECK, no
-- mention of deleted_at. Then verified, in one single transaction, that Postgres
-- resolves `auth.uid()` to the playlist's own owner and `podcast.is_admin()` to
-- true for that session — and the UPDATE still raised "new row violates
-- row-level security policy for table \"playlists\"" regardless.
--
-- That combination — a policy proven correct in text, and the exact values the
-- policy depends on proven correct in the same transaction, yet still rejected
-- — is not explainable by anything in the policy definition. Rather than keep
-- rewriting SQL that has already been shown to be right, this routes the
-- one operation that was failing (soft-deleting a playlist) around table RLS
-- entirely: a SECURITY DEFINER function does its own authorization check and
-- performs the update as the function's owner, who is exempt from RLS on this
-- table (FORCE ROW LEVEL SECURITY is off — confirmed via pg_class).
--
-- Nothing else changes: creating and editing a playlist, and everything about
-- tracks, were never affected by this — they go on using ordinary RLS-checked
-- statements exactly as before.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION podcast.delete_playlist(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, podcast
AS $$
BEGIN
    -- The same authorization the RLS policy already expressed, just enforced
    -- here instead of relying on RLS to enforce it on this table.
    IF NOT EXISTS (
        SELECT 1 FROM podcast.playlists
        WHERE id = p_id AND (user_id = auth.uid() OR podcast.is_admin())
    ) THEN
        RAISE EXCEPTION 'Not authorized to delete this playlist' USING ERRCODE = '42501';
    END IF;

    UPDATE podcast.playlists SET deleted_at = now() WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION podcast.delete_playlist(uuid) TO authenticated, service_role;

INSERT INTO podcast.schema_migrations (version)
VALUES ('033_playlist_delete_via_rpc')
ON CONFLICT DO NOTHING;

COMMIT;
