import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseQueue, ageInDays } from '../../../src/ui/queue.tsx';
import { QueueMeta } from '../../../src/ui/desk.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { foreignQueue, listIssuers } from '../../../src/animals/foreign-pedigree.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';

export const dynamic = 'force-dynamic';

/**
 * Association queue for foreign pedigrees (§21.2, D14).
 *
 * The review basis is the association's own registry of approved issuers, which
 * stays empty until the association enters real names.
 */
export default async function AssocForeignPedigreePage() {
  const guard = await guardRoute('/assoc/foreign-pedigree');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const page = await foreignQueue(db(), guard.actor, { page: 1, pageSize: 20 });
  const issuers = await listIssuers(db(), true);

  return (
    <OpsShell actor={guard.actor} title="Export Pedigree" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        {issuers.length === 0 ? (
          <Alert tone="warning" title="فهرست صادرکنندگان موردتأیید خالی است">
            مبنای بررسی، فهرست صادرکنندگان موردتأیید انجمن است. تا ورود فهرست واقعی، هیچ مدرکی قابل تأیید
            نیست.{' '}
            <Link href="/assoc/issuers" className="hz-link">
              مدیریت فهرست صادرکنندگان
            </Link>
          </Alert>
        ) : null}

        {page.items.length === 0 ? (
          <EmptyState
            title="پرونده‌ای در انتظار بررسی نیست"
            description="مدارک ارسال‌شده مالکان در همین صف دیده می‌شوند."
          />
        ) : (
          <>
            <QueueMeta
              total={page.total}
              oldestDays={Math.max(...page.items.map((item) => ageInDays(item.submittedAt) ?? 0))}
            />
            <CaseQueue
              label="صف Export Pedigree"
              rows={[...page.items]
                .sort((x, y) => (x.submittedAt?.getTime() ?? 0) - (y.submittedAt?.getTime() ?? 0))
                .map((item) => ({
                  id: item.id,
                  href: '/assoc/foreign-pedigree/' + item.id,
                  name: item.animalName,
                  code: item.documentCode,
                  sub:
                    'صادرکننده: ' +
                    (item.issuerName ?? '—') +
                    ' · ارسال: ' +
                    (item.submittedAt ? formatCivilDateFa(item.submittedAt.toISOString().slice(0, 10)) : '—'),
                  ageDays: ageInDays(item.submittedAt),
                  status: { tone: 'info' as const, label: 'در حال بررسی' },
                  owner: 'ASSOCIATION' as const,
                  ownerIsUs: true,
                  testId: 'open-foreign-case',
                }))}
            />
          </>
        )}
      </div>
    </OpsShell>
  );
}
