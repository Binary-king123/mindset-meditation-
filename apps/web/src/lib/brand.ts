/**
 * Single source of truth for brand strings. Import instead of hardcoding so a
 * rename touches one file.
 */
export const BRAND = {
  name: 'The Mindset Meditation',
  shortName: 'Mindset Meditation',
  tagline: 'Transform your mind, transform your life',
  description: 'Your space for inner peace, better sleep, and a healthier, happier mind.',
  /** Where footer enquiries are delivered. */
  contactEmail: 'millionairemindset17@gmail.com',
} as const;
