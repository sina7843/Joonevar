import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { studentCaseQueue } from '../../../src/vets/student-application.ts';
import { formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'OPEN', labelFa: 'در انتظار بررسی' },
  { key: 'CORRECTION', labelFa: 'منتظر اصلاح متقاضی' },
  { key: 'DECIDED', labelFa: 'تصمیم‌گرفته' },
] as const;
type View = (typeof VIEWS)[number]['key'];

/**
 * Veterinary student cases — Phase 2.5 PROMPT-004.
 *
 * The association admin verifies student number and university by hand
 * (PRODUCT_DECISIONS). The oldest waiting case comes first.
 */
export default async function AssocVetStudentsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  const guard = await guardRoute('/assoc/vet-students');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const params = await searchParams;
  const view: View = VIEWS.some((item) => item.key === params.view) ? (params.view as View) : 'OPEN';
  const page = await studentCaseQueue(db(), guard.actor, { view, page: Math.max(1, Number(params.page) || 1) });

  return (
    <OpsShell actor={guard.actor} title="دانشجویان دامپزشکی" pathname="/assoc/vet-students" nav={ASSOC_NAV}>
      <ViewChips
        chips={VIEWS.map((item) => ({
          key: item.key,
          href: '/assoc/vet-students?view=' + item.key,
          label: item.labelFa,
          current: item.key === view,
          testId: 'student-view-' + item.key,
        }))}
      />
      {page.items.length === 0 ? (
        <EmptyState title="پرونده‌ای در این نما نیست" description="درخواست‌های دانشجویی ارسال‌شده در همین صف دیده می‌شوند." />
      ) : (
        <CaseList label="صف پرونده‌ها" testId="student-queue">
          {page.items.map((item) => (
            <CaseItem
              key={item.id}
              name={item.displayNameFa ?? '—'}
              href={'/assoc/vet-students/' + item.id}
              linkLabel="بررسی پرونده"
              linkTestId="open-student-case"
              sub={<>{(item.universityFa ?? '—') + ' · شماره دانشجویی '}<bdi dir="ltr">{item.studentNumber ?? '—'}</bdi>{' · نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}</>}
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
