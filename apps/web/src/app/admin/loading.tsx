import { SkeletonBlock } from '@/components/ui/skeletons';

// The admin area is entirely dynamic (every page re-checks the session, the
// role and the second factor), so a click here always waits on the server.
// This is what makes that wait visible rather than looking like a dead click.
export default function Loading() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-7 w-56" />
      <SkeletonBlock className="h-4 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder list
          <SkeletonBlock key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
