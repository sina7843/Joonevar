import { LoadingState } from '../../../../src/ui/states.tsx';

// The list never redirects or 404s, so it may stream behind a loading state (DEC-0157).
export default function ArticlesListLoading() {
  return <LoadingState rows={3} label="در حال بارگذاری" />;
}
