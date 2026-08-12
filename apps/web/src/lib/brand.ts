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
  contactEmail: 'themindsetmeditation@gmail.com',

  /**
   * Social profiles for the footer icons.
   *
   * These were previously hardcoded in footer.tsx as bare `https://instagram.com`,
   * `https://youtube.com` and `https://x.com` — clicking an icon sent the visitor
   * to the platform's own homepage rather than to this show. An empty string
   * hides that icon entirely, which is better than a link that goes nowhere
   * useful: fill in the real profile URL to bring it back.
   */
  social: {
    instagram: 'https://www.instagram.com/themindsetmeditationpodcast/',
    youtube: 'https://www.youtube.com/@themindsetmeditation8824',
    x: 'https://open.spotify.com/show/6Gn5FiuA8zZhLHjRbrgEY2',
  },
} as const;
