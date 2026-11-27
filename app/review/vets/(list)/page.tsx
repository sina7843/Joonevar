import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { QueueFrame, hrefWith, param } from '../../../../src/ui/queue-head.tsx';
import { readQueueQuery } from '../../../../src/domain/queue-query.ts';
import { db } from '../../../../src/db/client.ts';
import { vetApplicationQueue } from '../../../../src/vets/onboarding.ts';
import { APPLICATION_KIND_FA } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type View = 'OPEN' | 'CORRECTION' | 'DECIDED';
type Search = Promise<{ view?: string | string[]; page?: string | string[]; q?: string | string[]; sort?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

const VIEWS: ReadonlyArray<{ view: View; label: string; empty: string }> = [
  { view: 'OPEN', label: 'در انتظار بررسی', empty: 'درخواستی در انتظار بررسی نیست' },
  { view: 'CORRECTION', label: 'نیازمند اصلاح', empty: 'درخواستی منتظر اصلاح درخواست‌دهنده نیست' },
  { view: 'DECIDED', label: 'تصمیم‌گرفته و بایگانی', empty: 'هنوز تصمیمی ثبت نشده است' },
];

/** Veterinarian applications and claims — Requirements-Phase-2 §8, §21 (PROMPT-007). */
export default async function ReviewVetsPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/review/vets');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const search = await searchParams;
  const view = (VIEWS.find((v) => v.view === one(search.view))?.view ?? 'OPEN') as View;
  const defaultSort = view === 'DECIDED' ? 'newest' : 'oldest';
  const query = readQueueQuery({ q: param(search.q), sort: param(search.sort), page: param(search.page) }, defaultSort);
  const [result, unsearched] = await Promise.all([
    vetApplicationQueue(db(), guard.actor, { view, page: query.page, q: query.q, sort: query.sort }),
    query.q === '' ? null : vetApplicationQueue(db(), guard.actor, { view, page: 1, pageSize: 1 }),
  ]);
  const all = unsearched?.total ?? result.total;
  const params = { view: view === 'OPEN' ? undefined : view, q: query.q, sort: query.sort === defaultSort ? undefined : query.sort };

  return (
    <OpsShell actor={guard.actor} title="درخواست‌های دامپزشک" pathname="/review/vets" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{fa(all) + ' درخواست'}</span>
        <span className="hz-page-header__meta-item">
          ساخت پروفایل و Claim با کد نظام و مدارک. تأیید، نقش دامپزشک معتمد خدمات همزیست را نمی‌دهد.
        </span>
      </p>

      <QueueFrame
        path="/review/vets"
        params={params}
        query={query}
        page={result}
        all={all}
        noun="درخواست"
        searchLabel="جست‌وجوی نام یا کد نظام"
        defaultSort={defaultSort}
        testId="review-queue-frame"
        chips={
        <ViewChips
          label="نمای درخواست‌ها"
          chips={VIEWS.map((entry) => ({
            key: entry.view,
            href: hrefWith('/review/vets', params, { view: entry.view === 'OPEN' ? undefined : entry.view, page: undefined }),
            label: entry.label,
            current: entry.view === view,
            testId: 'review-view-' + entry.view,
          }))}
        />
        }
      >
      {result.items.length === 0 ? (
        query.q !== '' ? (
          <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را دوباره بررسی کنید." />
        ) : (
        <EmptyState title={VIEWS.find((v) => v.view === view)!.empty} description="درخواست‌های تازه دامپزشکان اینجا نشان داده می‌شوند." />
        )
      ) : (
        <CaseList label="درخواست‌های دامپزشک" testId="review-queue">
          {result.items.map((item) => (
            <CaseItem
              key={item.id}
              type={APPLICATION_KIND_FA[item.kind] + (item.appealedAt ? ' · تجدیدنظر' : '')}
              name={item.displayNameFa}
              href={'/review/vets/' + item.id}
              linkTestId={'review-item-' + item.id}
              code={item.councilCode}
              sub={[
                item.cityNameFa,
                item.targetNameFa && item.kind === 'CLAIM' ? 'پروفایل: ' + item.targetNameFa : null,
                'ارسال: ' + formatInstantFa(item.submittedAt),
              ]
                .filter(Boolean)
                .join(' · ')}
              ageDays={item.status === 'SUBMITTED' ? ageInDays(item.createdAt) : undefined}
              status={{
                ...keyStatus(item.status),
              }}
              owner={item.status === 'SUBMITTED' ? 'SYSTEM' : null}
              ownerLabel="اپراتور بررسی"
              ownerIsUs
            />
          ))}
        </CaseList>
      )}

      </QueueFrame>
    </OpsShell>
  );
}
