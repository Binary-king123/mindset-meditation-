-- 036 — deleting an episode really deletes it, without losing play history
--
-- Two problems this fixes.
--
-- 1. `adminDeletePodcast` only ever set `deleted_at`. The row, its comments,
--    its favourites, its audio object in R2 and its cover in Supabase Storage
--    all stayed exactly where they were. Storage was billed forever for
--    episodes the admin believed were gone, and "delete" was really "hide".
--
-- 2. Deleting for real is what the admin asks for, but `play_events.track_id`
--    was NOT NULL with ON DELETE CASCADE — so a hard delete would take that
--    episode's entire play history with it, and every all-time figure on the
--    analytics dashboard (plays_total, listeners_total, listened_seconds_total)
--    would silently drop. Analytics that rewrite their own past are worse than
--    no analytics.
--
-- ON DELETE SET NULL keeps the event rows and detaches them from the episode.
-- The dashboard's totals aggregate play_events directly and never join tracks
-- for them, so those figures stay correct; per-episode breakdowns join tracks
-- and drop the orphans naturally, which is right — the episode no longer exists.
--
-- The detached rows keep no title, no key and no audio: just an anonymous
-- "a play happened, this long, from this kind of device".

ALTER TABLE podcast.play_events
    ALTER COLUMN track_id DROP NOT NULL;

ALTER TABLE podcast.play_events
    DROP CONSTRAINT IF EXISTS play_events_track_id_fkey;

ALTER TABLE podcast.play_events
    ADD CONSTRAINT play_events_track_id_fkey
    FOREIGN KEY (track_id) REFERENCES podcast.tracks(id) ON DELETE SET NULL;

COMMENT ON COLUMN podcast.play_events.track_id IS
    'NULL once the episode is deleted (ON DELETE SET NULL). The play still '
    'counts toward all-time totals; it just no longer names an episode.';

-- comments / favorites / playlist_tracks keep ON DELETE CASCADE: those rows are
-- *about* the episode and mean nothing without it, unlike a play event, which
-- is a fact about site traffic.
