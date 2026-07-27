import { PageSkeleton, SkeletonBlock, CardGridSkeleton } from '@/components/ui/skeletons';

export default function Loading() {
  return (
    <PageSkeleton>
      <div className="flex flex-col md:flex-row gap-8 md:gap-10 mb-14">
        <SkeletonBlock className="w-56 md:w-64 aspect-square rounded-3xl mx-auto md:mx-0 shrink-0" />
        <div className="flex-1 space-y-4">
          <SkeletonBlock className="h-6 w-32 rounded-full" />
          <SkeletonBlock className="h-10 w-3/4" />
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-12 w-64 rounded-full" />
        </div>
      </div>
      <SkeletonBlock className="h-32 rounded-3xl mb-14" />
      <CardGridSkeleton count={4} />
    </PageSkeleton>
  );
}
