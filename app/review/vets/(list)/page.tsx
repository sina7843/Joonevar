import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { vetApplicationQueue } from '../../../../src/vets/onboarding.ts';
import { APPLICATION_KIND_FA } from '../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type View = 'OPEN' | 'CORRECTION' | 'DECIDED';
type Search = Promise<{ view?: string | string[]; page?: string | string[] }>;
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
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const result = await vetApplicationQueue(db(), guard.actor, { view, page });
  const href = (target: View, targetPage = 1) =>
    '/review/vets' + (target === 'OPEN' && targetPage === 1 ? '' : '?view=' + target + (targetPage > 1 ? '&page=' + targetPage : ''));

  return (
    <OpsShell actor={guard.actor} title="درخواست‌های دامپزشک" pathname="/review/vets" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{fa(result.total) + ' درخواست'}</span>
        <span className="hz-page-header__meta-item">
          ساخت پروفایل و Claim با کد نظام و مدارک. تأیید، نقش دامپزشک معتمد خدمات همزیست را نمی‌دهد.
        </span>
      </p>
      <ViewChips
        label="نمای درخواست‌ها"
        chips={VIEWS.map((entry) => ({
          key: entry.view,
          href: href(entry.view),
          label: entry.label,
          current: entry.view === view,
          testId: 'review-view-' + entry.view,
        }))}
      />

      {result.items.length === 0 ? (
        <EmptyState title={VIEWS.find((v) => v.view === view)!.empty} description="درخواست‌های تازه دامپزشکان اینجا نشان داده می‌شوند." />
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
              ageDays={item.status === 'SUBMITTED' ? ageInDays(item.submittedAt) : undefined}
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

      {result.totalPages > 1 ? (
        <nav aria-label="صفحه‌بندی" className="flex items-center justify-between gap-md">
          {result.page > 1 ? <ButtonLink tone="secondary" size="sm" href={href(view, result.page - 1)}>صفحه قبل</ButtonLink> : <span />}
          <span className="text-body-sm text-text-secondary">{'صفحه ' + fa(result.page) + ' از ' + fa(result.totalPages)}</span>
          {result.page < result.totalPages ? <ButtonLink tone="secondary" size="sm" href={href(view, result.page + 1)}>صفحه بعد</ButtonLink> : <span />}
        </nav>
      ) : null}
    </OpsShell>
  );
}
