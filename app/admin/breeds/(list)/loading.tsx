import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

/* Table route only; detail pages keep a real 404 (DEC-0157). */
export default function AdminBreedsLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={4} label="در حال بارگذاری نژادها" />
    </div>
  );
}
