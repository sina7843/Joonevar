import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
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
      <nav className="mb-lg flex flex-wrap gap-md" aria-label="نمای صف">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={'/assoc/vet-students?view=' + item.key}
            aria-current={item.key === view ? 'page' : undefined}
            className={item.key === view ? 'text-label-md text-text-brand underline underline-offset-4' : 'text-label-md text-text-secondary'}
            data-testid={'student-view-' + item.key}
          >
            {item.labelFa}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <EmptyState title="پرونده‌ای در این نما نیست" description="درخواست‌های دانشجویی ارسال‌شده در همین صف دیده می‌شوند." />
      ) : (
        <ul className="space-y-md" data-testid="student-queue">
          {page.items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="text-label-lg">{item.displayNameFa ?? '—'}</h2>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {(item.universityFa ?? '—') + ' · شماره دانشجویی '}
                      <span dir="ltr">{item.studentNumber ?? '—'}</span>
                      {' · نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}
                    </p>
                  </div>
                  <StatusBadge tone={view === 'OPEN' ? 'info' : view === 'CORRECTION' ? 'warning' : 'neutral'}>{item.statusFa}</StatusBadge>
                </div>
                <p className="mt-lg">
                  <Link href={'/assoc/vet-students/' + item.id} className="text-label-md text-text-brand underline underline-offset-4" data-testid="open-student-case">
                    بررسی پرونده
                  </Link>
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </OpsShell>
  );
}
