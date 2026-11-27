import { LoadingState } from '../../../../src/ui/states.tsx';
import { PageHeaderSkeleton } from '../../../../src/ui/section-header.tsx';

/* Loading state for the packages list only; the payment return keeps its own answer. */
export default function AccountPackagesLoading() {
  return (
    <div className="space-y-lg">
      <PageHeaderSkeleton />
      <LoadingState rows={3} label="در حال بارگذاری بسته‌های تبلیغاتی" />
    </div>
  );
}
