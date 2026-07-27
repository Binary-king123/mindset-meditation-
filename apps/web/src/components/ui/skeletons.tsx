// Loading skeletons shared by the route-level loading.tsx files.
//
// The point of these is perceived speed: without a loading state a click on a
// dynamic route shows nothing at all until the server responds, which reads as
// the app being frozen. Next streams these in immediately instead.
import { cn } from '@/lib/utils';

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-xl', className)} />;
}

/** Matches the aspect and spacing of <PodcastCard>. */
export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length placeholder list
        <div key={i} className="rounded-2xl overflow-hidden glass-card">
          <SkeletonBlock className="aspect-square rounded-none" />
          <div className="p-4 space-y-2">
            <SkeletonBlock className="h-4 w-3/4" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen px-4 md:px-8 pt-28 pb-32 max-w-7xl mx-auto w-full">{children}</div>
  );
}
