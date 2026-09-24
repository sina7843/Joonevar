import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import {
  MEMBER_PAGE_SIZE,
  accountsWithoutMembership,
  memberRecordCount,
  memberRecords,
} from '../../../src/operations/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { membershipQueue } from '../../../src/billing/membership.ts';
import { MEMBERSHIP_STATUS_FA, type MembershipStatus } from '../../../src/billing/membership-model.ts';
import { DecideMembershipForm, IssueNumberForm, MembershipStateForm } from './forms.tsx';
import { MemberSearch } from './search.tsx';

export const dynamic = 'force-dynamic';

const STATUS_FA: Record<string, string> = MEMBERSHIP_STATUS_FA;

const STATUS_TONE: Partial<Record<MembershipStatus, 'success' | 'info' | 'warning' | 'error' | 'neutral'>> = {
  ACTIVE: 'success',
  APPROVED_AWAITING_PAYMENT: 'info',
  PENDING_REVIEW: 'info',
  NEEDS_CORRECTION: 'warning',
  EXPIRED: 'warning',
  SUSPENDED: 'error',
  REVOKED: 'error',
  REJECTED: 'error',
};

const NUMBER_FA: Record<string, string> = {
  PENDING: 'صادرنشده',
  ISSUED: 'صادرشده',
};

/**
 * The membership register and its review queue — §21.2, §7, Phase 2.5 §6.
 *
 * Since PROMPT-009 a membership is applied for and reviewed here, then bought
 * one period at a time. This screen decides applications with a written reason,
 * records numbers, and suspends or revokes a membership — it never grants a
 * period nobody paid for.
 */
export default async function AssocMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const guard = await guardRoute('/assoc/members');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const term = (await searchParams).q?.trim() ?? '';
  const [rows, withoutMembership, total, waiting, corrections] = await Promise.all([
    memberRecords(db(), guard.actor, { search: term }),
    accountsWithoutMembership(db(), guard.actor),
    memberRecordCount(db(), guard.actor, term),
    membershipQueue(db(), guard.actor, { status: 'SUBMITTED' }),
    membershipQueue(db(), guard.actor, { status: 'NEEDS_CORRECTION' }),
  ]);
  const hidden = Math.max(0, total - rows.length);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — انجمن" pathname="/assoc/members" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="عضویت پس از بررسی و پرداخت تأییدشده فعال می‌شود">
          <span data-testid="members-note">
            تأیید درخواست فقط پرداخت دوره را باز می‌کند؛ فعال‌سازی با تأیید سروری پرداخت انجام می‌شود. عضویت‌های
            فعال پیش از دوره‌ای شدن، مادام‌العمر می‌مانند و تاریخ پایان نمی‌گیرند.
          </span>
        </Alert>

        <Card>
          <h2 className="text-label-lg">درخواست‌های در انتظار بررسی</h2>
          {waiting.items.length === 0 && corrections.items.length === 0 ? (
            <p className="mt-md text-body-sm text-text-disabled" data-testid="membership-queue-empty">
              درخواست بازی در صف نیست.
            </p>
          ) : (
            <ul className="mt-md space-y-lg" data-testid="membership-queue">
              {waiting.items.map((item) => (
                <li key={item.id}>
                  <p className="text-body-sm">
                    {formatInstantFa(new Date(item.updatedAt))}
                    {item.statementFa ? ' — ' + item.statementFa : ''}
                  </p>
                  <DecideMembershipForm applicationId={item.id} version={item.version} />
                </li>
              ))}
              {corrections.items.map((item) => (
                <li key={item.id} className="text-body-sm text-text-secondary" data-testid="membership-awaiting-correction">
                  {'در انتظار اصلاح متقاضی · ' + formatInstantFa(new Date(item.updatedAt)) + (item.reviewNoteFa ? ' — ' + item.reviewNoteFa : '')}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <MemberSearch term={term} />

        {hidden > 0 ? (
          <p className="text-caption text-text-secondary" data-testid="members-truncated">
            {MEMBER_PAGE_SIZE} رکورد تازه‌ترین نمایش داده شده است؛ {hidden} رکورد دیگر با این جست‌وجو
            هم‌خوان است و در این فهرست نیست. برای رسیدن به یک عضو مشخص، از جست‌وجو استفاده کنید.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            title={term === '' ? 'هنوز عضویتی ثبت نشده است' : 'با این جست‌وجو عضوی پیدا نشد'}
            description={
              term === ''
                ? withoutMembership + ' حساب بدون رکورد عضویت وجود دارد.'
                : 'نام، شماره عضویت یا چهار رقم آخر موبایل را دوباره بررسی کنید.'
            }
          />
        ) : (
          <ul className="space-y-lg" data-testid="member-list">
            {rows.map((row) => (
              <li key={row.accountId}>
                <Card>
                  <div className="flex items-start justify-between gap-md">
                    <div className="min-w-0">
                      <h2 className="text-label-md">{row.nameFa}</h2>
                      <p className="mt-2xs text-caption text-text-secondary" dir="ltr">
                        {row.mobileTail}
                      </p>
                      <p className="mt-2xs text-caption text-text-secondary">
                        {row.membershipNo
                          ? 'شماره عضویت: ' + row.membershipNo
                          : NUMBER_FA[row.numberStatus] ?? row.numberStatus}
                        {row.activatedAt
                          ? ' · فعال از ' + formatCivilDateFa(row.activatedAt.toISOString().slice(0, 10))
                          : ''}
                      </p>
                    </div>
                    <StatusBadge tone={STATUS_TONE[row.status as MembershipStatus] ?? 'neutral'}>
                      <span data-testid={'member-status-' + row.accountId}>
                        {STATUS_FA[row.status] ?? row.status}
                      </span>
                    </StatusBadge>
                  </div>

                  {row.membershipNo === null ? (
                    <IssueNumberForm accountId={row.accountId} suffix={row.accountId} />
                  ) : null}
                  {row.status === 'ACTIVE' || row.status === 'SUSPENDED' || row.status === 'EXPIRED' ? (
                    <MembershipStateForm accountId={row.accountId} suspended={row.status === 'SUSPENDED'} suffix={row.accountId} />
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OpsShell>
  );
}
