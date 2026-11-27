import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

/* Loading state for the search results only. */
export default function SearchLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={5} label="در حال جست‌وجو" />
    </div>
  );
}
