import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import { db } from '../../../../src/db/client.ts';
import { myRequests } from '../../../../src/finder/requests.ts';
import { personalMatingsOf } from '../../../../src/finder/downstream.ts';
import { REQUEST_STATUS_FA, type RequestStatus } from '../../../../src/finder/request-model.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { commandProblem, LIVE_STATUSES } from '../../../../src/finder/request-model.ts';
import { ActionOwner } from '../../../../src/ui/status.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

/** Incoming and outgoing mating requests — PHASE-4 PROMPT-005. */
export default async function FinderRequestsPage() {
  const guard = await guardRoute('/account/mating-finder/requests');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const [rows, personal] = await Promise.all([myRequests(db(), guard.actor), personalMatingsOf(db(), guard.actor)]);
  const section = (title: string, list: typeof rows, testId: string, party: 'SENDER' | 'RECEIVER') => (
    <section className="space-y-md" aria-label={title}>
      <SectionHeader title={title} count={list.length > 0 ? list.length.toLocaleString('fa-IR') : undefined} />
      {list.length === 0 ? (
        <p className="hz-body-sm text-text-secondary">موردی نیست.</p>
      ) : (
        <ul className="hz-cardlist" data-testid={testId}>
          {list.map((r) => {
            const snap = r.snapshot as { sender: { nameFa: string | null }; receiver: { nameFa: string } };
            const status = r.status as RequestStatus;
            // Only the first answer has one owner in the command table (ACCEPT is the receiver's).
            const owner =
              status === 'WAITING_REVIEW' && !r.pausedAt
                ? commandProblem('ACCEPT', status, party) === null
                  ? ('USER' as const)
                  : ('COUNTERPARTY' as const)
                : null;
            return (
              <li key={r.id} className="hz-cardlist__item">
                <div className="hz-cardlist__row">
                  <Link
                    href={'/account/mating-finder/requests/' + r.id}
                    className="hz-cardlist__title min-w-0 text-text-primary"
                    data-testid={'finder-request-link-' + r.id}
                  >
                    {(snap.sender.nameFa ?? 'بدون نام') + ' ← ' + snap.receiver.nameFa}
                  </Link>
                  <span className="flex flex-wrap items-center gap-xs">
                    <StatusBadge tone={status === 'CONTRACT_CONFIRMED' ? 'success' : ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(status) ? 'neutral' : 'info'}>
                      {REQUEST_STATUS_FA[status]}
                    </StatusBadge>
                    {r.pausedAt ? <StatusBadge tone="warning">متوقف تا پایان هماهنگی دیگر</StatusBadge> : null}
                  </span>
                </div>
                <div className="hz-cardlist__row">
                  <span className="hz-cardlist__meta">{'به‌روزشده ' + formatInstantFa(r.updatedAt)}</span>
                  <Link href={'/account/mating-finder/requests/' + r.id} className="inline-flex items-center gap-xs text-label-md text-text-brand">
                    {LIVE_STATUSES.includes(status) ? 'پیگیری' : 'مشاهده'}
                    <Icon name="caretRight" size="sm" mirror />
                  </Link>
                </div>
                {owner ? <ActionOwner owner={owner} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
  return (
    <PublicShell
      actor={guard.actor}
      title="درخواست‌های جفت‌گیری"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="درخواست‌های جفت‌گیری"
          back={{ href: '/account/mating-finder' }}
          meta={[
            ...(rows.length > 0 ? [rows.length.toLocaleString('fa-IR') + ' درخواست'] : []),
            'درخواست‌های ورودی نامحدودند، ولی هر حیوان در هر زمان فقط با یک درخواست وارد تنظیم قرارداد می‌شود.',
          ]}
          actions={
            <ButtonLink tone="secondary" href="/mating-finder" iconStart="magnifyingGlass">
              جست‌وجوی جفت
            </ButtonLink>
          }
        />
      }
    >
      <div className="space-y-xl">
        {rows.length === 0 ? (
          <EmptyState
            icon="handshake"
            title="درخواستی ندارید"
            description="از صفحه جست‌وجوی جفت، برای پروفایل مناسب درخواست بفرستید."
            action={
              <ButtonLink tone="secondary" href="/mating-finder">
                جست‌وجوی جفت
              </ButtonLink>
            }
          />
        ) : (
          <>
            {section('ورودی', rows.filter((r) => r.receiverAccountId === guard.actor.accountId), 'finder-requests-in', 'RECEIVER')}
            {section('ارسالی', rows.filter((r) => r.senderAccountId === guard.actor.accountId), 'finder-requests-out', 'SENDER')}
          </>
        )}
        {personal.length > 0 ? (
          <section className="space-y-md" aria-labelledby="finder-personal-title">
            <SectionHeader id="finder-personal-title" title="پرونده‌های جفت‌گیری شخصی" count={personal.length.toLocaleString('fa-IR')} />
            <p className="hz-body-sm text-text-secondary">پرونده‌های رسمی در بخش مجوزهای جفت‌گیری فهرست شده‌اند.</p>
            <ul className="hz-cardlist" data-testid="finder-personal-list">
              {personal.map((m) => (
                <li key={m.id}>
                  <Link
                    href={'/account/mating-finder/personal/' + m.id}
                    className="hz-cardlist__item hz-card--interactive text-text-primary no-underline"
                  >
                    <span className="hz-cardlist__row">
                      <span className="hz-cardlist__title">پرونده شخصی</span>
                      <StatusBadge tone={m.status === 'ACTIVE' ? 'info' : 'neutral'}>{m.status === 'ACTIVE' ? 'فعال' : 'لغوشده'}</StatusBadge>
                    </span>
                    <span className="hz-cardlist__meta">{formatInstantFa(m.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PublicShell>
  );
}
