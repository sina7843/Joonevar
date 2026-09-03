import { Card } from '../../../src/ui/card.tsx';
import { Button } from '../../../src/ui/button.tsx';
import { TextField } from '../../../src/ui/field.tsx';

/**
 * Finding one member in the register — §21.2.
 *
 * A plain GET form, so a search is a shareable, resumable URL. It exists because
 * the list is bounded: without it, a member outside the newest page would be one
 * the association cannot manage at all.
 */
export function MemberSearch({ term }: { term: string }) {
  return (
    <Card>
      <form method="get" action="/assoc/members" className="space-y-lg" data-testid="member-search">
        <TextField
          label="جست‌وجوی عضو"
          name="q"
          defaultValue={term}
          hint="نام و نام خانوادگی، شماره عضویت، یا چهار رقم آخر موبایل."
          data-testid="member-search-term"
        />
        <Button type="submit" data-testid="member-search-submit">
          جست‌وجو
        </Button>
      </form>
    </Card>
  );
}
