/**
 * Single source of truth for brand strings. Import instead of hardcoding so a
 * rename touches one file.
 */
export const BRAND = {
  name: 'The Mindset Meditation',
  shortName: 'Mindset Meditation',
  tagline: 'Transform your mind, transform your life',
  description:
    'Guided meditation sessions for sleep, stress, focus, and clarity. Press play, breathe, and build a daily practice that changes how your mind feels.',
} as const;
