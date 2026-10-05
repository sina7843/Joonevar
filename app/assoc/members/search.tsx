import { Button } from '../../../src/ui/button.tsx';
import { SearchField } from '../../../src/ui/search-field.tsx';

/**
 * Finding one member in the register — §21.2 (DS P09 queue head: SearchField).
 *
 * A plain GET form, so a search is a shareable, resumable URL. It exists because
 * the list is bounded: without it, a member outside the newest page would be one
 * the association cannot manage at all.
 */
export function MemberSearch({ term }: { term: string }) {
  return (
    <form method="get" action="/assoc/members" className="flex flex-wrap items-center gap-sm" data-testid="member-search">
      <SearchField
        id="member-search-term"
        label="جست‌وجوی عضو: نام، شماره عضویت یا چهار رقم آخر موبایل"
        name="q"
        defaultValue={term}
        className="min-w-0 flex-1 basis-64"
        data-testid="member-search-term"
      />
      <Button type="submit" tone="secondary" data-testid="member-search-submit">
        جست‌وجو
      </Button>
    </form>
  );
}
