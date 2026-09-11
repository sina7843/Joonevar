import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the centre list only; the detail page keeps a real 404 (DEC-0157). */
export default function ReviewCentresLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری مراکز" />;
}
