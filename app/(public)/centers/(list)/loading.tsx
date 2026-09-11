import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the centre list only; the centre page has none so its 404 stays a real 404 (DEC-0157). */
export default function CentersLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری مراکز" />;
}
