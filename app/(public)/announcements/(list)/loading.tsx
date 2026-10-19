import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

// The list never redirects or 404s, so it may stream behind a loading state (DEC-0157).
export default function AnnouncementsListLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={3} label="در حال بارگذاری" />
    </div>
  );
}
