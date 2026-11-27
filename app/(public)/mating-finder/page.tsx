import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '../../../src/db/client.ts';
import { buildMetadata } from '../../../src/seo/metadata.ts';
import { site, viewer } from '../../../src/public/request.ts';
import { Alert } from '../../../src/ui/alert.tsx';
import { Button, ButtonLink } from '../../../src/ui/button.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { breedOptions } from '../../../src/animals/service.ts';
import { searchProfiles } from '../../../src/finder/discovery.ts';
import { filtersToQuery } from '../../../src/finder/discovery-model.ts';
import { ownerAnimalsForFinder } from '../../../src/finder/subscriptions.ts';
import { MatingProfileCardView } from '../../../src/finder/profile-card.tsx';
import { FavoriteForm, SaveSearchForm } from '../../../src/finder/discovery-forms.tsx';
import { PROFILE_STATE_FA, PUBLIC_STATES } from '../../../src/finder/profile-model.ts';
import { SCORE_DISCLAIMER_FA } from '../../../src/finder/compatibility.ts';

export const dynamic = 'force-dynamic';

/*
 * What a viewer sees depends on their subscription, so the search is never
 * indexed; it is a tool, not a catalogue.
 */
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: 'جفت‌یابی', description: 'جست‌وجوی جفت هم‌نژاد برای حیوانات ثبت‌شده در همزیست.', path: '/mating-finder', noindex: true }, site());
}

const fa = (n: number) => n.toLocaleString('fa-IR');

function Select({ name, label, value, options, testId }: { name: string; label: string; value: string; options: ReadonlyArray<[string, string]>; testId: string }) {
  const id = 'f-' + name;
  return (
    <div className="hz-field">
      <label htmlFor={id} className="hz-field__label">
        {label}
      </label>
      <span className="hz-select-wrap">
        <select id={id} name={name} defaultValue={value} className="hz-select" data-testid={testId}>
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

function Input({ name, label, value, type = 'text', testId }: { name: string; label: string; value: string; type?: string; testId: string }) {
  const id = 'f-' + name;
  return (
    <div className="hz-field">
      <label htmlFor={id} className="hz-field__label">
        {label}
      </label>
      <input id={id} name={name} type={type} defaultValue={value} inputMode={type === 'number' ? 'numeric' : undefined} className="hz-input" data-testid={testId} />
    </div>
  );
}

/**
 * Mating discovery — PHASE-4 PROMPT-004.
 *
 * A plain GET form, so it works without JavaScript and every search is a link.
 * With one of the viewer's own animals chosen it becomes match mode: same breed
 * and opposite sex are forced on the server, and each result carries its
 * explained compatibility.
 */
export default async function MatingFinderSearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const actor = await viewer();
  const [result, breeds, mine] = await Promise.all([
    searchProfiles(db(), actor, raw),
    breedOptions(db()),
    actor ? ownerAnimalsForFinder(db(), actor.accountId) : Promise.resolve([]),
  ]);
  const f = result.filters;
  const query = new URLSearchParams(filtersToQuery(f)).toString();
  // Secondary filters start folded on a phone, and open when one of them is in use.
  const advanced = Object.keys(filtersToQuery(f)).some((k) => !['for', 'breed', 'sex'].includes(k));

  return (
    <div className="space-y-xl">
      <PageHeader
        title="جفت‌یابی"
        meta={[
          'فقط حیوانات هم‌نژاد و جنس مخالف به هم پیشنهاد می‌شوند. اشتراک فقط دسترسی می‌دهد و رتبه هیچ حیوانی را بالا نمی‌برد.',
        ]}
      />

      {result.closed ? (
        <div data-testid="finder-search-closed">
          <Alert tone="info" title="جست‌وجوی جفت در حال حاضر بسته است">
            مدیریت هنوز جست‌وجو را باز نکرده است.
          </Alert>
        </div>
      ) : (
        <div className="grid gap-xl lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start">
          <aside aria-label="فیلترهای جفت‌یابی" className="min-w-0 lg:sticky lg:top-[calc(var(--header-site)+24px)]">
            <form method="get" action="/mating-finder" className="hz-card flex flex-col gap-md" data-testid="finder-filters" role="search" aria-label="فیلترهای جفت‌یابی">
              <SectionHeader title="فیلترها" size="sm" />
              {mine.length > 0 ? (
                <Select
                  name="for"
                  label="جفت برای حیوان من"
                  value={f.forAnimalId ?? ''}
                  options={[['', 'بدون انتخاب (مرور)'], ...mine.map((a) => [a.id, a.name ?? 'بدون نام'] as [string, string])]}
                  testId="finder-filter-for"
                />
              ) : null}
              <Select name="breed" label="نژاد" value={f.breedId ?? ''} options={[['', 'همه نژادها'], ...breeds.map((b) => [b.id, b.nameFa] as [string, string])]} testId="finder-filter-breed" />
              <Select name="sex" label="جنس" value={f.sex ?? ''} options={[['', 'هر دو'], ['MALE', 'نر'], ['FEMALE', 'ماده']]} testId="finder-filter-sex" />
              <details className="group border-t border-border-subtle pt-md" open={advanced}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-sm text-label-sm text-text-brand" data-testid="finder-more-filters">
                  فیلترهای بیشتر
                  <Icon name="caretDown" size="sm" className="transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-md flex flex-col gap-md">
                  <Input name="province" label="استان" value={f.province ?? ''} testId="finder-filter-province" />
                  <Input name="city" label="شهر" value={f.city ?? ''} testId="finder-filter-city" />
                  <Input name="distance" label="حداکثر فاصله (کیلومتر)" value={f.maxDistanceKm?.toString() ?? ''} type="number" testId="finder-filter-distance" />
                  <Input name="minAge" label="حداقل سن (ماه)" value={f.minAgeMonths?.toString() ?? ''} type="number" testId="finder-filter-min-age" />
                  <Input name="maxAge" label="حداکثر سن (ماه)" value={f.maxAgeMonths?.toString() ?? ''} type="number" testId="finder-filter-max-age" />
                  <Select name="pedigree" label="شجره‌نامه" value={f.pedigree} options={[['ANY', 'مهم نیست'], ['YES', 'دارد'], ['NO', 'ندارد']]} testId="finder-filter-pedigree" />
                  <Select
                    name="lastMating"
                    label="آخرین جفت‌گیری تأییدشده"
                    value={f.lastMating}
                    options={[['ANY', 'مهم نیست'], ['NONE', 'بدون سابقه'], ['90', 'نه در ۹۰ روز اخیر'], ['180', 'نه در ۱۸۰ روز اخیر'], ['365', 'نه در یک سال اخیر']]}
                    testId="finder-filter-last-mating"
                  />
                  <Select name="cooldown" label="فاصله استراحت" value={f.cooldown} options={[['ANY', 'مهم نیست'], ['CLEAR', 'فقط خارج از فاصله استراحت']]} testId="finder-filter-cooldown" />
                  <Select name="ownerKind" label="نوع مالک" value={f.ownerKind} options={[['ANY', 'همه'], ['OWNER', 'مالک شخصی'], ['KENNEL', 'کنل']]} testId="finder-filter-owner-kind" />
                  <Select
                    name="availability"
                    label="وضعیت"
                    value={f.availability ?? ''}
                    options={[['', 'همه وضعیت‌ها'], ...PUBLIC_STATES.map((s) => [s, PROFILE_STATE_FA[s]] as [string, string])]}
                    testId="finder-filter-availability"
                  />
                  <Select name="completeness" label="حداقل کامل‌بودن اطلاعات" value={String(f.minCompleteness)} options={[0, 1, 2, 3, 4, 5].map((n) => [String(n), fa(n) + ' از ۵'] as [string, string])} testId="finder-filter-completeness" />
                </div>
              </details>
              <div className="flex flex-wrap items-center justify-between gap-sm border-t border-border-subtle pt-md">
                <Button type="submit" data-testid="finder-search-submit">
                  جست‌وجو
                </Button>
                <Link href="/mating-finder" className="hz-link hz-body-sm">
                  پاک کردن همه
                </Link>
              </div>
            </form>
          </aside>

          <section aria-labelledby="finder-results-title" className="min-w-0 space-y-lg">
            <h2 id="finder-results-title" className="hz-visually-hidden">
              نتایج جفت‌یابی
            </h2>
            {result.problemFa ? <Alert tone="warning" title={result.problemFa} /> : null}

            {result.mode === 'MATCH' && result.forAnimal ? (
              <p className="hz-body-sm" data-testid="finder-match-mode">
                {'پیشنهادهای هم‌نژاد و جنس مخالف برای ' + result.forAnimal.nameFa + '، به ترتیب امتیاز سازگاری. ' + SCORE_DISCLAIMER_FA}
              </p>
            ) : null}

            <p className="hz-body-sm text-text-secondary" data-testid="finder-result-count" aria-live="polite">
              {fa(result.total) + ' پروفایل'}
            </p>

            {result.items.length === 0 ? (
              <EmptyState
                title="پروفایلی با این فیلترها پیدا نشد"
                description="فیلترها را کمتر کنید، یا بعداً دوباره سر بزنید؛ حیوانات تازه با فعال‌سازی مالکانشان اضافه می‌شوند."
                action={
                  <ButtonLink tone="secondary" href="/mating-finder">
                    پاک کردن همه
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="grid gap-s20 md:grid-cols-2 xl:grid-cols-3" data-testid="finder-results">
                {result.items.map((item) => (
                  <li key={item.profileId} className="min-w-0" data-testid={'finder-result-' + item.profileId}>
                    <MatingProfileCardView card={item.card} href={'/mating-finder/' + item.profileId}>
                      {item.evaluation ? (
                        <section className="hz-fit" aria-label="توضیح سازگاری" data-testid={'finder-evaluation-' + item.profileId}>
                          <p className="hz-fit__title" data-testid={'finder-score-' + item.profileId}>
                            {'امتیاز سازگاری: ' + fa(item.evaluation.score) + ' از ۱۰۰'}
                          </p>
                          {(
                            [
                              ['موانع', item.evaluation.blockers, 'blockers', 'prohibit'],
                              ['هشدارها', item.evaluation.warnings, 'warnings', 'warning'],
                              ['نامعلوم', item.evaluation.unknowns, 'unknowns', 'info'],
                              ['نکات مثبت', item.evaluation.positives, 'positives', 'check'],
                            ] as const
                          ).map(([title, list, key, icon]) =>
                            list.length > 0 ? (
                              <div key={key} className="mt-xs">
                                <h3 className="text-caption text-text-secondary">{title}</h3>
                                <ul className="hz-fit__list" aria-label={title} data-testid={'finder-eval-' + key + '-' + item.profileId}>
                                  {list.map((line) => (
                                    <li key={line} className="hz-fit__item">
                                      <Icon name={icon} size="xs" />
                                      {line}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null,
                          )}
                          <p className="hz-mating__note mt-xs">{item.evaluation.disclaimerFa}</p>
                        </section>
                      ) : null}
                      <div className="hz-card__footer">
                        {actor ? <FavoriteForm profileId={item.profileId} favorite={item.favorite} /> : null}
                        {item.distanceKm !== null ? <span className="hz-caption">{'فاصله تقریبی: ' + fa(item.distanceKm) + ' کیلومتر'}</span> : null}
                        <Link href={'/mating-finder/' + item.profileId} className="hz-link hz-link--standalone">
                          صفحه پروفایل
                          <Icon name="arrowRight" size="xs" mirror />
                        </Link>
                      </div>
                    </MatingProfileCardView>
                  </li>
                ))}
              </ul>
            )}

            {result.next ? (
              <div className="flex justify-center">
                <ButtonLink
                  tone="secondary"
                  href={'/mating-finder?' + new URLSearchParams({ ...filtersToQuery(f), cursor: result.next }).toString()}
                  data-testid="finder-next-page"
                >
                  نتایج بیشتر
                </ButtonLink>
              </div>
            ) : null}

            {actor && query !== '' ? (
              <section className="hz-card" aria-labelledby="finder-save-title">
                <SectionHeader id="finder-save-title" title="ذخیره این جست‌وجو" size="sm" />
                <SaveSearchForm query={query} />
              </section>
            ) : null}
          </section>
        </div>
      )}
    </div>
  );
}
