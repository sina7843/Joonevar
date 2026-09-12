import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the packages list only; the payment return keeps its own answer. */
export default function AccountPackagesLoading() {
  return <LoadingState rows={3} label="در حال بارگذاری بسته‌های تبلیغاتی" />;
}
