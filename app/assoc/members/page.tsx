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
import { IssueNumberForm, MembershipStateForm } from './forms.tsx';
import { MemberSearch } from './search.tsx';

export const dynamic = 'force-dynamic';

const STATUS_FA: Record<string, string> = {
  NONE: 'بدون عضویت',
  PAYMENT_PENDING: 'در انتظار پرداخت',
  ACTIVE: 'فعال',
  INACTIVE: 'غیرفعال',
};

const NUMBER_FA: Record<string, string> = {
  PENDING: 'صادرنشده',
  ISSUED: 'صادرشده',
};

/**
 * The membership register — §21.2, §7, D04.
 *
 * A paid F14 membership is already active: this screen manages records and
 * numbers, and never asks the member to wait for an approval that §7 does not
 * have. Issuing the number later changes nothing about what is already open.
 */
export default async function AssocMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const guard = await guardRoute('/assoc/members');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const term = (await searchParams).q?.trim() ?? '';
  const [rows, withoutMembership, total] = await Promise.all([
    memberRecords(db(), guard.actor, { search: term }),
    accountsWithoutMembership(db(), guard.actor),
    memberRecordCount(db(), guard.actor, term),
  ]);
  const hidden = Math.max(0, total - rows.length);

  return (
    <OpsShell actor={guard.actor} title="هم‌زیست — انجمن" pathname="/assoc/members" nav={ASSOC_NAV}>
      <div className="space-y-lg">
        <Alert tone="info" title="عضویت پرداخت‌شده به صف تأیید بازنمی‌گردد">
          <span data-testid="members-note">
            پرداخت موفق، عضویت مادام‌العمر را فعال می‌کند. شماره عضویت پس از آن ثبت می‌شود و نبود شماره هیچ
            خدمتی را نمی‌بندد.
          </span>
        </Alert>

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
                    <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : 'warning'}>
                      <span data-testid={'member-status-' + row.accountId}>
                        {STATUS_FA[row.status] ?? row.status}
                      </span>
                    </StatusBadge>
                  </div>

                  {row.membershipNo === null ? (
                    <IssueNumberForm accountId={row.accountId} suffix={row.accountId} />
                  ) : null}
                  {row.status === 'ACTIVE' || row.status === 'INACTIVE' ? (
                    <MembershipStateForm
                      accountId={row.accountId}
                      active={row.status === 'ACTIVE'}
                      suffix={row.accountId}
                    />
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
