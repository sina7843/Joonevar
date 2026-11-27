import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

/* Loading state for the centre list only; the centre page has none so its 404 stays a real 404 (DEC-0157). */
export default function CentersLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={4} label="در حال بارگذاری مراکز" />
    </div>
  );
}
