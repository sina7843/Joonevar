import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

/* Loading state for the service list only; a service page keeps its real 404. */
export default function ServicesLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={4} label="در حال بارگذاری خدمات" />
    </div>
  );
}
