import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the directory list only; the profile page has none so its 404 stays a real 404 (DEC-0157). */
export default function VeterinariansLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری دامپزشکان" />;
}
