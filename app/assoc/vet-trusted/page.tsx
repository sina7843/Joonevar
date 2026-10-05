import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
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
      <ViewChips
        chips={VIEWS.map((item) => ({
          key: item.key,
          href: '/assoc/vet-trusted?view=' + item.key,
          label: item.labelFa,
          current: item.key === view,
          testId: 'trusted-view-' + item.key,
        }))}
      />

      {items.length === 0 ? (
        <EmptyState title="درخواستی در این نما نیست" description="درخواست معتمد فقط از دامپزشکی با پروانه فعال و عضویت معتبر ثبت می‌شود." />
      ) : (
        <CaseList label="صف پرونده‌ها" testId="trusted-queue">
          {items.map((item) => (
            <CaseItem
              key={item.id}
              name={item.displayNameFa ?? '—'}
              href={'/assoc/vet-trusted/' + item.id}
              linkLabel="بررسی درخواست"
              linkTestId="open-trusted-case"
              sub={<>{'نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}</>}
              ageDays={ageInDays(new Date(item.updatedAt))}
              status={{ tone: item.status === 'REJECTED' ? 'error' : item.status === 'NEEDS_CORRECTION' ? 'warning' : 'info', label: item.statusFa }}
              owner={item.status === 'NEEDS_CORRECTION' ? 'USER' : item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' ? 'ASSOCIATION' : null}
              ownerIsUs
            />
          ))}
        </CaseList>
      )}
    </OpsShell>
  );
}
