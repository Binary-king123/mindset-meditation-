import { CardGridSkeleton, PageSkeleton, SkeletonBlock } from '@/components/ui/skeletons';

export default function Loading() {
  return (
    <PageSkeleton>
      <SkeletonBlock className="h-40 rounded-3xl mb-10" />
      <CardGridSkeleton count={8} />
    </PageSkeleton>
  );
}
