import { LoadingState } from '../../../../../src/ui/states.tsx';

/* Loading state for the claim queue only; the detail page keeps a real 404 (DEC-0157). */
export default function ReviewCentreClaimsLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری درخواست‌ها" />;
}
