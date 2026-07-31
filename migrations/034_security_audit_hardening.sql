-- =============================================================================
-- 034 — security audit hardening
-- =============================================================================
-- A full RBAC/RLS audit of the production schema found five issues, none of
-- them exploited by the app's own code (every real call site already does the
-- safe thing), but each one a real gap for anything calling the database
-- directly — PostgREST, a future feature, or a malicious authenticated user.
--
-- 1. podcast.get_user_role(p_user_id) is SECURITY DEFINER with no check that
--    the caller is asking about themselves. Combined with the blanket
--    `GRANT EXECUTE ON ALL FUNCTIONS ... TO anon, authenticated`, any signed-in
--    user could call rpc('get_user_role', {p_user_id: <victim>}) and learn
--    who is admin/super_admin — reconnaissance for targeting those accounts.
-- 2. podcast.user_has_permission(p_user_id, p_permission) has the same shape
--    of gap. Its one real caller (the podcast_audio_admin_upload storage
--    policy) always passes auth.uid(), so this closes a latent path rather
--    than changing behavior.
-- 3. storage.objects policy "podcast_audio_authenticated_read" allowed ANY
--    authenticated user to read ANY object in the private podcast-audio
--    bucket, including unpublished drafts — bypassing the publish-status gate
--    that /api/stream/[id] enforces via RLS before minting a signed URL nothing
--    in the app reads this bucket directly, so this is now admin-only, matching
--    the sibling delete/upload policies on the same bucket.
-- 4. comments_update_own had no WITH CHECK, so (unlike comments_insert_own) a
--    user could retarget their own comment's track_id to an unpublished track.
-- 5. playlist_tracks_manage_own had no WITH CHECK, so a user could link an
--    unpublished track into their own playlist row (tracks_select_published
--    still hides the actual track content — integrity gap, not a data leak).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION podcast.get_user_role(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
    v_role TEXT;
BEGIN
    IF p_user_id IS DISTINCT FROM auth.uid() AND NOT podcast.is_admin() THEN
        RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role FROM podcast.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_role, 'user');
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

DROP POLICY IF EXISTS "podcast_audio_authenticated_read" ON storage.objects;
DROP POLICY IF EXISTS "podcast_audio_admin_read" ON storage.objects;
CREATE POLICY "podcast_audio_admin_read" ON storage.objects
    AS PERMISSIVE
    FOR SELECT TO authenticated
    USING (((bucket_id = 'podcast-audio'::text) AND podcast.is_admin()));

DROP POLICY IF EXISTS comments_update_own ON podcast.comments;
CREATE POLICY comments_update_own ON podcast.comments
    AS PERMISSIVE
    FOR UPDATE TO public
    USING ((user_id = auth.uid()))
    WITH CHECK (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM podcast.tracks t
  WHERE ((t.id = comments.track_id) AND (t.status = 'published'::text) AND (t.deleted_at IS NULL))))));

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

INSERT INTO podcast.schema_migrations (version)
VALUES ('034_security_audit_hardening')
ON CONFLICT DO NOTHING;

COMMIT;
