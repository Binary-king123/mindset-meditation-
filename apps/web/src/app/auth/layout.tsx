// The auth pages carry no search value. They inherit `noindex, follow` from
// the root layout along with every other non-homepage route, so nothing needs
// declaring here.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
