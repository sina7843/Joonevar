import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

/* Loading state for the list only; the detail page keeps a real 404 (DEC-0157). */
export default function ReviewCommunitiesLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={4} label="در حال بارگذاری انجمن‌ها و کلاب‌ها" />
    </div>
  );
}
