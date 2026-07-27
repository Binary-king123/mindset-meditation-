import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * There are no generated `Database` types for the podcast schema, so the first
 * generic has to stay loose. Declaring that here means a single suppression in
 * one file, rather than repeating `SupabaseClient<any, 'podcast'>` and its
 * linter exemption in every client module.
 *
 * Row shapes are enforced at the call site instead, against the interfaces in
 * `@mindset/types`, which mirror `fullschema.sql`.
 */
// biome-ignore lint/suspicious/noExplicitAny: no generated types for the podcast schema
export type PodcastDatabase = any;

/** A Supabase client scoped to the `podcast` schema. */
export type PodcastClient = SupabaseClient<PodcastDatabase, 'podcast'>;
