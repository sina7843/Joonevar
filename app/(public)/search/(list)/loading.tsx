import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the search results only. */
export default function SearchLoading() {
  return <LoadingState rows={5} label="در حال جست‌وجو" />;
}
