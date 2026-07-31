# migrations/

`fullschema.sql` at the repo root is the source of truth for the database. This
directory holds **one-time upgrade scripts** for a database that already exists
and is behind — nothing more. There is no migration runner.

## Which file do I run?

| Situation | Run |
|---|---|
| Brand-new Supabase project | `fullschema.sql` — it already contains everything |
| Existing database, behind by one version | the matching `NNN_*.sql` here |
| Not sure what state you are in | `fullschema.sql` — it is idempotent and converges |
| You changed the schema | Edit `fullschema.sql`, then add a delta file here for anyone already deployed |

Check where a database currently is:

```sql
SELECT version FROM podcast.schema_migrations ORDER BY version DESC LIMIT 1;
```

## The rule that keeps these honest

**Every statement in a file here must also appear in `fullschema.sql`.** The two
are not alternatives — a fresh install runs `fullschema.sql` only, and an
existing database runs the delta only, and both must end up at the same schema.
When they disagree, a bug appears on exactly one of those two paths and is
invisible on the other.

## Files

| Version | What it does |
|---|---|
| `030_seo_metadata_and_search.sql` | Generated SEO columns (`excerpt`, `meta_description`, `keywords`, `published_at`, `file_size_bytes`, `bitrate_kbps`, `blur_data_url`), `search_vector` + GIN indexes on tracks and playlists, the ranked `search_tracks` RPC, and fixes for three functions that referenced tables this schema never creates — including `is_super_admin()`, which was live in an RLS policy and made every profile delete fail. |

| `031_playlist_soft_delete_policy.sql` | Rebuilds the four `podcast.playlists` RLS policies to match `fullschema.sql`. The live UPDATE policy carried `deleted_at IS NULL` in its WITH CHECK, so an admin pressing Delete got "new row violates row-level security policy" — soft-delete was blocked by the policy meant to permit it. Policies had not been touched since 010, so the delta path had drifted from a fresh install. |
| `032_verify_playlist_delete_policy.sql` | The same fix as 031, reapplied unconditionally — the version row for 031 was present yet the same delete still failed, so this stops trusting `schema_migrations` as proof and rebuilds the four policies again. Includes a self-test: it performs the exact failing operation (`SET ROLE authenticated` + a real admin's JWT claims, then the soft-delete) inside a transaction that always rolls back, so the SQL editor itself reports pass or fail rather than the app. Not a schema change — the self-test writes nothing durable, so there is nothing here that needs to appear in `fullschema.sql` beyond the version marker. |
| `033_playlist_delete_via_rpc.sql` | The update policy was proven correct — verified in `pg_policies` character-for-character, and `auth.uid()`/`podcast.is_admin()` proven to resolve exactly right in the *same transaction* as a failing `UPDATE` — and it still rejected the soft-delete. Rather than keep changing SQL already shown to be right, this adds `podcast.delete_playlist(p_id)`, a `SECURITY DEFINER` function that performs the identical owner-or-admin check itself and updates as its own owner, bypassing table RLS for this one operation. `adminDeletePlaylist` now calls this RPC instead of a direct `.update()`. |
| `034_security_audit_hardening.sql` | A full RBAC/RLS audit found five gaps, none exploited by the app itself: `get_user_role`/`user_has_permission` (both `SECURITY DEFINER`) let any caller query an arbitrary user's role, enabling admin-account enumeration — both now require the caller to be asking about themselves or to already be an admin. The storage policy `podcast_audio_authenticated_read` let any authenticated user read any object in the private audio bucket directly, including unpublished drafts, bypassing the publish-status gate `/api/stream/[id]` enforces — replaced with an admin-only read policy, since nothing legitimate reads that bucket directly. `comments_update_own` and `playlist_tracks_manage_own` were missing a `WITH CHECK`, so a user could retarget their own comment or playlist entry onto an unpublished track — both now require the track to still be published. |

Anything numbered below 030 was folded into `fullschema.sql` and deleted; the
version list at the bottom of that file is the remaining record of them.
