import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
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
    <OpsShell actor={guard.actor} title="شجره‌نامه خارجی" pathname="/assoc/foreign-pedigree" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        {issuers.length === 0 ? (
          <Alert tone="warning" title="فهرست صادرکنندگان موردتأیید خالی است">
            مبنای بررسی، فهرست صادرکنندگان موردتأیید انجمن است. تا ورود فهرست واقعی، هیچ مدرکی قابل تأیید
            نیست.{' '}
            <Link href="/assoc/issuers" className="text-text-brand underline underline-offset-4">
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
          <ul className="space-y-md">
            {page.items.map((item) => (
              <li key={item.id}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h2 className="text-label-lg">{item.animalName}</h2>
                      <p className="mt-2xs text-caption text-text-secondary">
                        صادرکننده: {item.issuerName ?? '—'} · ارسال:{' '}
                        {item.submittedAt ? formatCivilDateFa(item.submittedAt.toISOString().slice(0, 10)) : '—'}
                      </p>
                    </div>
                    <StatusBadge tone="info">در حال بررسی</StatusBadge>
                  </div>
                  <div className="mt-lg">
                    <Link
                      href={'/assoc/foreign-pedigree/' + item.id}
                      className="text-label-md text-text-brand underline underline-offset-4"
                      data-testid="open-foreign-case"
                    >
                      بررسی پرونده
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
