'use client';

import { Card } from '../../src/ui/card.tsx';
import { Button } from '../../src/ui/button.tsx';
import { SelectField, TextField } from '../../src/ui/field.tsx';

/**
 * Finder filters — §11.1.
 *
 * A plain GET form, so a filtered search is a shareable, resumable URL and the
 * back button behaves. The supported filters are the ones the product really
 * has: text, city and distance. No slot, calendar or earliest-appointment
 * control exists to be added here.
 */
export function FinderFilters({
  context,
  contexts,
  cities,
  term,
  city,
  distance,
  selection,
}: {
  context: string;
  contexts: ReadonlyArray<{ value: string; label: string }>;
  cities: readonly string[];
  term: string;
  city: string;
  distance: string;
  selection: string;
}) {
  return (
    <Card>
      <form method="get" action="/vets" className="space-y-lg" data-testid="finder-filters">
        {selection === '' ? null : <input type="hidden" name="sel" value={selection} />}
        <SelectField
          label="نوع خدمت"
          name="context"
          defaultValue={context}
          placeholder="انتخاب کنید"
          options={contexts.map((c) => ({ value: c.value, label: c.label }))}
          data-testid="finder-context"
        />
        <TextField
          label="جست‌وجو"
          name="term"
          defaultValue={term}
          hint="نام دامپزشک، نام مرکز یا محله."
          data-testid="finder-term"
        />
        <SelectField
          label="شهر"
          name="city"
          defaultValue={city}
          placeholder="همه شهرها"
          options={cities.map((value) => ({ value, label: value }))}
          data-testid="finder-city"
        />
        <SelectField
          label="حداکثر فاصله"
          name="distance"
          defaultValue={distance}
          placeholder="بدون محدودیت فاصله"
          hint="فاصله فقط وقتی محاسبه می‌شود که موقعیت مرکز ثبت شده باشد."
          options={[
            { value: '5', label: 'تا ۵ کیلومتر' },
            { value: '10', label: 'تا ۱۰ کیلومتر' },
            { value: '25', label: 'تا ۲۵ کیلومتر' },
          ]}
          data-testid="finder-distance"
        />
        <Button type="submit" block data-testid="finder-search">
          جست‌وجو
        </Button>
      </form>
    </Card>
  );
}
