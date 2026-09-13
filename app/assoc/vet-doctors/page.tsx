import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
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
      <nav className="mb-lg flex flex-wrap gap-md" aria-label="نمای صف">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={'/assoc/vet-doctors?view=' + item.key}
            aria-current={item.key === view ? 'page' : undefined}
            className={item.key === view ? 'text-label-md text-text-brand underline underline-offset-4' : 'text-label-md text-text-secondary'}
            data-testid={'doctor-view-' + item.key}
          >
            {item.labelFa}
          </Link>
        ))}
      </nav>
      {page.items.length === 0 ? (
        <EmptyState title="پرونده‌ای در این نما نیست" description="درخواست‌های دکتر دامپزشک در همین صف دیده می‌شوند." />
      ) : (
        <ul className="space-y-md" data-testid="doctor-queue">
          {page.items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="text-label-lg">{item.displayNameFa ?? '—'}</h2>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {(item.claim ? 'Claim پروفایل بدون مالک · ' : 'پروفایل تازه · ') + (item.practiceScope ? SCOPE_FA[item.practiceScope] + ' · ' : '') + 'کد نظام '}
                      <span dir="ltr">{item.councilCode ?? '—'}</span>
                      {' · نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}
                    </p>
                  </div>
                  <StatusBadge tone={view === 'OPEN' ? 'info' : view === 'CORRECTION' ? 'warning' : 'neutral'}>{item.statusFa}</StatusBadge>
                </div>
                <p className="mt-lg">
                  <Link href={'/assoc/vet-doctors/' + item.id} className="text-label-md text-text-brand underline underline-offset-4" data-testid="open-doctor-case">
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
