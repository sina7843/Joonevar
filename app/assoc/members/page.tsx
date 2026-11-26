import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import {
  MEMBER_PAGE_SIZE,
  accountsWithoutMembership,
  memberRecordCount,
  memberRecords,
} from '../../../src/operations/service.ts';
import { formatCivilDateFa } from '../../../src/domain/calendar.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { CaseDrawer } from '../case-drawer.tsx';
import { membershipQueue } from '../../../src/billing/membership.ts';
import { DecideMembershipForm, IssueNumberForm, MembershipStateForm } from './forms.tsx';
import { MemberSearch } from './search.tsx';
import { QUEUE_SORT_FA, QUEUE_SORTS, readQueueQuery, sliceQueue } from '../../../src/domain/queue-query.ts';
import { QueueHead, hrefWith } from '../../../src/ui/queue-head.tsx';
import { Pagination } from '../../../src/ui/pagination.tsx';

export const dynamic = 'force-dynamic';

/** Membership values whose dictionary key has another name; the rest share the name. */
const MEMBERSHIP_KEY: Record<string, string> = {
  APPROVED_AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  PAYMENT_PENDING: 'PENDING_PAYMENT',
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
  searchParams: Promise<{ q?: string; sort?: string; page?: string }>;
}) {
  const guard = await guardRoute('/assoc/members');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const params = await searchParams;
  const term = params.q?.trim() ?? '';
  // `q` searches the register below, so the queue takes only the order and the page.
  const query = { ...readQueueQuery(params), q: '' };
  const [rows, withoutMembership, total, waiting, corrections] = await Promise.all([
    memberRecords(db(), guard.actor, { search: term }),
    accountsWithoutMembership(db(), guard.actor),
    memberRecordCount(db(), guard.actor, term),
    membershipQueue(db(), guard.actor, { status: 'SUBMITTED' }),
    membershipQueue(db(), guard.actor, { status: 'NEEDS_CORRECTION' }),
  ]);
  const hidden = Math.max(0, total - rows.length);
  const queue = sliceQueue([...waiting.items, ...corrections.items], query, {
    text: (item) => item.statementFa ?? '',
    at: (item) => new Date(item.updatedAt),
    name: (item) => item.statementFa ?? '',
  });
  const keep = { q: term, sort: query.sort === 'oldest' ? undefined : query.sort };

  return (
    <OpsShell actor={guard.actor} title="عضویت" pathname="/assoc/members" nav={ASSOC_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          {(waiting.items.length + corrections.items.length).toLocaleString('fa-IR') + ' درخواست در صف'}
        </span>
        <span className="hz-page-header__meta-item">{total.toLocaleString('fa-IR') + ' رکورد عضویت'}</span>
      </p>
      <Alert tone="info" title="عضویت پس از بررسی و پرداخت تأییدشده فعال می‌شود">
        <span data-testid="members-note">
          تأیید درخواست فقط پرداخت دوره را باز می‌کند؛ فعال‌سازی با تأیید سروری پرداخت انجام می‌شود. عضویت‌های
          فعال پیش از دوره‌ای شدن، مادام‌العمر می‌مانند و تاریخ پایان نمی‌گیرند.
        </span>
      </Alert>

      <Panel title="درخواست‌های در انتظار بررسی" count={waiting.items.length.toLocaleString('fa-IR')}>
        {waiting.items.length === 0 && corrections.items.length === 0 ? (
          <p className="text-body-sm text-text-secondary" data-testid="membership-queue-empty">
            درخواست بازی در صف نیست.
          </p>
        ) : (
          <QueueHead
            total={queue.all}
            shown={queue.total}
            noun="درخواست"
            sort={{
              label: 'مرتب‌سازی درخواست‌ها',
              testId: 'membership-queue-sort',
              options: QUEUE_SORTS.map((key) => ({
                key,
                label: QUEUE_SORT_FA[key],
                current: key === query.sort,
                href: hrefWith('/assoc/members', keep, { sort: key === 'oldest' ? undefined : key }),
              })),
            }}
          >
            <CaseList label="صف درخواست عضویت" testId="membership-queue">
              {queue.items.map((item) =>
                item.status === 'NEEDS_CORRECTION' ? (
                  <CaseItem
                    key={item.id}
                    testId="membership-awaiting-correction"
                    type="درخواست عضویت"
                    name={'در انتظار اصلاح متقاضی · ' + formatInstantFa(new Date(item.updatedAt)) + (item.reviewNoteFa ? ' — ' + item.reviewNoteFa : '')}
                    status={keyStatus('NEEDS_CORRECTION')}
                    owner="USER"
                  />
                ) : (
                  <CaseItem
                    key={item.id}
                    type="درخواست عضویت"
                    name={item.statementFa || 'درخواست عضویت'}
                    sub={'آخرین تغییر: ' + formatInstantFa(new Date(item.updatedAt))}
                    ageDays={ageInDays(new Date(item.updatedAt))}
                    status={keyStatus('PENDING_REVIEW')}
                    owner="ASSOCIATION"
                    ownerIsUs
                  >
                    <CaseDrawer title="درخواست عضویت" testId="open-membership-case">
                      <KeyValueList
                        rows={[
                          { key: 'توضیح متقاضی', value: item.statementFa },
                          { key: 'آخرین تغییر', value: formatInstantFa(new Date(item.updatedAt)) },
                          { key: 'نسخه', value: item.version.toLocaleString('fa-IR') },
                        ]}
                      />
                      <DecideMembershipForm applicationId={item.id} version={item.version} />
                    </CaseDrawer>
                  </CaseItem>
                ),
              )}
            </CaseList>
            <Pagination
              page={queue.page}
              pageSize={queue.pageSize}
              total={queue.total}
              totalPages={queue.totalPages}
              hrefFor={(target) => hrefWith('/assoc/members', keep, { page: target > 1 ? String(target) : undefined })}
            />
          </QueueHead>
        )}
      </Panel>

      <Panel title="سوابق عضویت" count={total.toLocaleString('fa-IR')}>
        <MemberSearch term={term} />

        {hidden > 0 ? (
          <p className="text-caption text-text-secondary" data-testid="members-truncated">
            {MEMBER_PAGE_SIZE.toLocaleString('fa-IR')} رکورد تازه‌ترین نمایش داده شده است؛ {hidden.toLocaleString('fa-IR')} رکورد دیگر با این جست‌وجو
            هم‌خوان است و در این فهرست نیست. برای رسیدن به یک عضو مشخص، از جست‌وجو استفاده کنید.
          </p>
        ) : null}

        {rows.length === 0 ? (
          <EmptyState
            title={term === '' ? 'هنوز عضویتی ثبت نشده است' : 'با این جست‌وجو عضوی پیدا نشد'}
            description={
              term === ''
                ? withoutMembership.toLocaleString('fa-IR') + ' حساب بدون رکورد عضویت وجود دارد.'
                : 'نام، شماره عضویت یا چهار رقم آخر موبایل را دوباره بررسی کنید.'
            }
          />
        ) : (
          <CaseList label="سوابق عضویت" testId="member-list">
            {rows.map((row) => (
              <CaseItem
                key={row.accountId}
                name={row.nameFa}
                code={row.membershipNo}
                sub={
                  <>
                    <bdi dir="ltr">{row.mobileTail}</bdi>
                    {' · '}
                    {row.membershipNo ? 'شماره عضویت صادرشده' : NUMBER_FA[row.numberStatus] ?? row.numberStatus}
                    {row.activatedAt ? ' · فعال از ' + formatCivilDateFa(row.activatedAt.toISOString().slice(0, 10)) : ''}
                  </>
                }
                status={{ ...keyStatus(MEMBERSHIP_KEY[row.status] ?? row.status), testId: 'member-status-' + row.accountId }}
              >
                {row.membershipNo === null ? <IssueNumberForm accountId={row.accountId} suffix={row.accountId} /> : null}
                {row.status === 'ACTIVE' || row.status === 'SUSPENDED' || row.status === 'EXPIRED' ? (
                  <MembershipStateForm accountId={row.accountId} suspended={row.status === 'SUSPENDED'} suffix={row.accountId} />
                ) : null}
              </CaseItem>
            ))}
          </CaseList>
        )}
      </Panel>
    </OpsShell>
  );
}
