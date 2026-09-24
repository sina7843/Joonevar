import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { trustedCaseQueue } from '../../../src/vets/trusted-application.ts';
import { formatInstantFa } from '../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'OPEN', labelFa: 'در انتظار بررسی' },
  { key: 'CORRECTION', labelFa: 'منتظر اصلاح متقاضی' },
  { key: 'DECIDED', labelFa: 'تصمیم‌گرفته' },
] as const;

/**
 * Trusted-veterinarian applications — Phase 2.5 §7.
 *
 * The association checks that the two conditions still hold and that the
 * declaration is there; nothing in this queue asks for evidence of equipment,
 * because none is required.
 */
export default async function AssocVetTrustedPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const guard = await guardRoute('/assoc/vet-trusted');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const params = await searchParams;
  const view = VIEWS.some((item) => item.key === params.view) ? params.view! : 'OPEN';
  const items = await trustedCaseQueue(db(), guard.actor, { view });

  return (
    <OpsShell actor={guard.actor} title="درخواست‌های دامپزشک معتمد" pathname="/assoc/vet-trusted" nav={ASSOC_NAV}>
      <nav className="mb-lg flex flex-wrap gap-md" aria-label="نمای صف">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={'/assoc/vet-trusted?view=' + item.key}
            aria-current={item.key === view ? 'page' : undefined}
            className={item.key === view ? 'text-label-md text-text-brand underline underline-offset-4' : 'text-label-md text-text-secondary'}
            data-testid={'trusted-view-' + item.key}
          >
            {item.labelFa}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <EmptyState title="درخواستی در این نما نیست" description="درخواست معتمد فقط از دامپزشکی با پروانه فعال و عضویت معتبر ثبت می‌شود." />
      ) : (
        <ul className="space-y-md" data-testid="trusted-queue">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-md">
                  <div className="min-w-0">
                    <h2 className="text-label-lg">{item.displayNameFa ?? '—'}</h2>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {'نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}
                    </p>
                  </div>
                  <StatusBadge tone={item.status === 'REJECTED' ? 'error' : item.status === 'NEEDS_CORRECTION' ? 'warning' : 'info'}>{item.statusFa}</StatusBadge>
                </div>
                <p className="mt-lg">
                  <Link href={'/assoc/vet-trusted/' + item.id} className="text-label-md text-text-brand underline underline-offset-4" data-testid="open-trusted-case">
                    بررسی درخواست
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
