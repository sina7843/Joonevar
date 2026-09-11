import { LoadingState } from '../../../../src/ui/states.tsx';

/*
 * Loading state for the breed list only (DEC-0157).
 *
 * A loading boundary starts streaming before the page runs, so a redirect or a
 * not-found inside it can no longer set the status code: a moved breed address
 * would answer 200 instead of 308 and a draft 200 instead of 404. The list never
 * redirects or 404s, so it is the one public page that keeps a boundary; the
 * breed page, home and about render before anything is sent.
 */
export default function BreedListLoading() {
  return <LoadingState rows={4} label="در حال بارگذاری نژادها" />;
}
