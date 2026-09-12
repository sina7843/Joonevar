import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the province list only; a place page keeps its real 404. */
export default function PlacesLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری استان‌ها" />;
}
