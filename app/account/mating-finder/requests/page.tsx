import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { myRequests } from '../../../../src/finder/requests.ts';
import { REQUEST_STATUS_FA, type RequestStatus } from '../../../../src/finder/request-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';

export const dynamic = 'force-dynamic';

/** Incoming and outgoing mating requests — PHASE-4 PROMPT-005. */
export default async function FinderRequestsPage() {
  const guard = await guardRoute('/account/mating-finder/requests');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await myRequests(db(), guard.actor);
  const section = (title: string, list: typeof rows, testId: string) => (
    <Card>
      <h2 className="text-label-lg">{title}</h2>
      {list.length === 0 ? (
        <p className="mt-sm text-body-sm text-text-secondary">موردی نیست.</p>
      ) : (
        <ul className="mt-md space-y-sm" data-testid={testId}>
          {list.map((r) => {
            const snap = r.snapshot as { sender: { nameFa: string | null }; receiver: { nameFa: string } };
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm">
                <Link href={'/account/mating-finder/requests/' + r.id} className="text-label-md text-text-brand underline underline-offset-4" data-testid={'finder-request-link-' + r.id}>
                  {(snap.sender.nameFa ?? 'بدون نام') + ' ← ' + snap.receiver.nameFa}
                </Link>
                <span className="flex flex-wrap items-center gap-xs text-caption">
                  {formatInstantFa(r.updatedAt)}
                  <StatusBadge tone={r.status === 'CONTRACT_CONFIRMED' ? 'success' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(r.status) ? 'neutral' : 'info'}>
                    {REQUEST_STATUS_FA[r.status as RequestStatus]}
                  </StatusBadge>
                  {r.pausedAt ? <StatusBadge tone="warning">متوقف تا پایان هماهنگی دیگر</StatusBadge> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
  return (
    <PublicShell actor={guard.actor} title="درخواست‌های جفت‌گیری" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">درخواست‌های جفت‌گیری</h1>
          <p className="mt-xs text-caption text-text-secondary">
            درخواست‌های ورودی نامحدودند، ولی هر حیوان در هر زمان فقط با یک درخواست وارد تنظیم قرارداد می‌شود.
          </p>
        </Card>
        {rows.length === 0 ? (
          <EmptyState title="درخواستی ندارید" description="از صفحه جست‌وجوی جفت، برای پروفایل مناسب درخواست بفرستید." />
        ) : (
          <>
            {section('ورودی', rows.filter((r) => r.receiverAccountId === guard.actor.accountId), 'finder-requests-in')}
            {section('ارسالی', rows.filter((r) => r.senderAccountId === guard.actor.accountId), 'finder-requests-out')}
          </>
        )}
      </div>
    </PublicShell>
  );
}
