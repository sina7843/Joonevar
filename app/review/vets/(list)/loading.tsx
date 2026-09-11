import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the application queue only; detail pages keep a real 404 (DEC-0157). */
export default function ReviewVetsLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری درخواست‌ها" />;
}
