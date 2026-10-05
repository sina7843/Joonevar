import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { OpsShell, REVIEW_NAV } from '../../../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../../../src/ui/desk.tsx';
import { ageInDays } from '../../../../../src/ui/queue.tsx';
import { EmptyState } from '../../../../../src/ui/states.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { db } from '../../../../../src/db/client.ts';
import { centreClaimQueue } from '../../../../../src/centres/claims.ts';
import { APPLICATION_STATUS_FA, type VetApplicationStatus } from '../../../../../src/vets/onboarding-model.ts';
import { formatInstantFa } from '../../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

type View = 'OPEN' | 'CORRECTION' | 'DECIDED';
type Search = Promise<{ view?: string | string[]; page?: string | string[] }>;
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';
const fa = (value: number): string => value.toLocaleString('fa-IR');

const VIEWS: ReadonlyArray<{ view: View; label: string; empty: string }> = [
  { view: 'OPEN', label: 'در انتظار بررسی', empty: 'درخواستی در انتظار بررسی نیست' },
  { view: 'CORRECTION', label: 'نیازمند اصلاح', empty: 'درخواستی منتظر اصلاح نیست' },
  { view: 'DECIDED', label: 'تصمیم‌گرفته و بایگانی', empty: 'هنوز تصمیمی ثبت نشده است' },
];

/** Centre claims — Requirements-Phase-2 §10, §21 (PROMPT-009). */
export default async function ReviewCentreClaimsPage({ searchParams }: { searchParams: Search }) {
  const guard = await guardRoute('/review/centres/claims');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const search = await searchParams;
  const view = (VIEWS.find((entry) => entry.view === one(search.view))?.view ?? 'OPEN') as View;
  const pageNumber = Number(one(search.page));
  const page = Number.isInteger(pageNumber) && pageNumber >= 1 ? pageNumber : 1;
  const result = await centreClaimQueue(db(), guard.actor, { view, page });
  const href = (target: View, targetPage = 1) =>
    '/review/centres/claims' + (target === 'OPEN' && targetPage === 1 ? '' : '?view=' + target + (targetPage > 1 ? '&page=' + targetPage : ''));

  return (
    <OpsShell actor={guard.actor} title="Claim مراکز" pathname="/review/centres/claims" nav={REVIEW_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">{fa(result.total) + ' درخواست مدیریت مرکز'}</span>
        <span className="hz-page-header__meta-item">
          تأیید، ویرایش آینده مرکز را به درخواست‌دهنده می‌سپارد. تاریخچه ثبت‌شده مرکز منتقل نمی‌شود و همان‌جا می‌ماند.
        </span>
      </p>
      <ViewChips
        label="نمای درخواست‌ها"
        chips={VIEWS.map((entry) => ({
          key: entry.view,
          href: href(entry.view),
          label: entry.label,
          current: entry.view === view,
          testId: 'claim-view-' + entry.view,
        }))}
      />

      {result.items.length === 0 ? (
        <EmptyState title={VIEWS.find((entry) => entry.view === view)!.empty} description="درخواست‌های تازه نماینده‌های مراکز اینجا می‌آیند." />
      ) : (
        <CaseList label="درخواست‌های مدیریت مرکز" testId="claim-queue">
          {result.items.map((item) => (
            <CaseItem
              key={item.id}
              type={item.appealedAt ? 'تجدیدنظر' : undefined}
              name={
                <>
                  {item.claimantNameFa}
                  <span className="block text-caption font-normal text-text-secondary">{item.centreNameFa}</span>
                </>
              }
              href={'/review/centres/claims/' + item.id}
              linkTestId={'claim-item-' + item.id}
              sub={[item.roleFa, 'ارسال: ' + formatInstantFa(item.submittedAt)].filter(Boolean).join(' · ')}
              ageDays={item.status === 'SUBMITTED' ? ageInDays(item.submittedAt) : undefined}
              status={{
                tone: item.status === 'SUBMITTED' ? 'info' : item.status === 'APPROVED' ? 'success' : 'neutral',
                label: APPLICATION_STATUS_FA[item.status as VetApplicationStatus],
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
