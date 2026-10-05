import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { doctorCaseQueue } from '../../../src/vets/doctor-application.ts';
import { formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'OPEN', labelFa: 'در انتظار بررسی' },
  { key: 'CORRECTION', labelFa: 'منتظر اصلاح متقاضی' },
  { key: 'DECIDED', labelFa: 'تصمیم‌گرفته' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const SCOPE_FA: Record<string, string> = { GENERAL: 'عمومی', SPECIALIST: 'متخصص' };

/**
 * Council-code cases of doctors — Phase 2.5 PROMPT-005.
 *
 * The association admin verifies the council code by hand (PRODUCT_DECISIONS).
 * The oldest waiting case comes first; a claim of an unowned page says so.
 */
export default async function AssocVetDoctorsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const guard = await guardRoute('/assoc/vet-doctors');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const params = await searchParams;
  const view: View = VIEWS.some((item) => item.key === params.view) ? (params.view as View) : 'OPEN';
  const page = await doctorCaseQueue(db(), guard.actor, { view, page: Math.max(1, Number(params.page) || 1) });

  return (
    <OpsShell actor={guard.actor} title="کد نظام دامپزشکان" pathname="/assoc/vet-doctors" nav={ASSOC_NAV}>
      <ViewChips
        chips={VIEWS.map((item) => ({
          key: item.key,
          href: '/assoc/vet-doctors?view=' + item.key,
          label: item.labelFa,
          current: item.key === view,
          testId: 'doctor-view-' + item.key,
        }))}
      />
      {page.items.length === 0 ? (
        <EmptyState title="پرونده‌ای در این نما نیست" description="درخواست‌های دکتر دامپزشک در همین صف دیده می‌شوند." />
      ) : (
        <CaseList label="صف پرونده‌ها" testId="doctor-queue">
          {page.items.map((item) => (
            <CaseItem
              key={item.id}
              name={item.displayNameFa ?? '—'}
              href={'/assoc/vet-doctors/' + item.id}
              linkLabel="بررسی پرونده"
              linkTestId="open-doctor-case"
              sub={<>{(item.claim ? 'Claim پروفایل بدون مالک · ' : 'پروفایل تازه · ') + (item.practiceScope ? SCOPE_FA[item.practiceScope] + ' · ' : '') + 'کد نظام '}<bdi dir="ltr">{item.councilCode ?? '—'}</bdi>{' · نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}</>}
              ageDays={ageInDays(new Date(item.updatedAt))}
              status={{ tone: view === 'OPEN' ? 'info' : view === 'CORRECTION' ? 'warning' : 'neutral', label: item.statusFa }}
              owner={view === 'OPEN' ? 'ASSOCIATION' : view === 'CORRECTION' ? 'USER' : null}
              ownerIsUs
            />
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
