import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the service list only; a service page keeps its real 404. */
export default function ServicesLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری خدمات" />;
}
