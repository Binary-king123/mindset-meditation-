import type { Metadata } from 'next';

// Sign-in and sign-up pages carry no search value and would only dilute the
// crawl budget, so they are indexed out while still passing link equity on.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
