import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../src/ui/shell.tsx';
import { SectionHeader } from '../../src/ui/section-header.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { StatTiles, whenFa } from '../../src/ui/desk.tsx';
import { CaseQueue, QueueTiles, ageInDays } from '../../src/ui/queue.tsx';
import { StatusBadge } from '../../src/ui/status.tsx';
import { statusOf } from '../../src/ui/status-dictionary.ts';
import { EmptyState } from '../../src/ui/states.tsx';
import { db } from '../../src/db/client.ts';
import {
  ageState,
  associationOldestCases,
  associationQueues,
  associationRecentDecisions,
  associationTiles,
  reviewClock,
} from '../../src/operations/service.ts';

export const dynamic = 'force-dynamic';

/** What an association decision was about, in words (unknown types read «پرونده»). */
const DECISION_SUBJECT_FA: Record<string, string> = {
  KYC_CASE: 'احراز هویت',
  ACCOUNT: 'حساب کاربری',
  KENNEL: 'کنل',
  MATING_CASE: 'مجوز جفت‌گیری',
  FOREIGN_PEDIGREE_CASE: 'Export Pedigree',
  VET_PROFESSIONAL_CASE: 'پرونده دامپزشک',
  VET_APPLICATION: 'پرونده دامپزشک',
  MEMBERSHIP_APPLICATION: 'عضویت',
  COMMUNITY: 'کلاب',
  COMMUNITY_MANAGER: 'مالکیت کلاب',
  PEDIGREE_ISSUER: 'صادرکننده',
};

/**
 * Association operations — §21.2, §21.5, D11 — DS P09 home / K13: eight
 * QueueTiles with the oldest case's age, the summary StatTiles, the oldest open
 * cases across every queue, then the latest decisions.
 *
 * Every tile is a real count from the same table its detail screen reads, and
 * every tile opens that queue. Late/overdue come from the managed review clock
 * (`ops.review_*_days`); while it is unset nothing is flagged (DEC-0241). A
 * successful F14 membership never returns to a blocking approval queue (D04).
 */
export default async function AssocPage() {
  const guard = await guardRoute('/assoc');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const database = db();
  const [queues, clock, oldest, decisions] = await Promise.all([
    associationQueues(database, guard.actor),
    reviewClock(database),
    associationOldestCases(database, guard.actor, 5),
    associationRecentDecisions(database, guard.actor, 5),
  ]);
  const tiles = associationTiles(queues);
  const open = tiles.reduce((sum, tile) => sum + tile.waiting, 0);
  const busy = tiles.filter((tile) => tile.waiting > 0);
  const tileAge = (at: Date | null) => {
    const days = ageInDays(at);
    return { days, state: ageState(days, clock) };
  };
  const overdueTiles = tiles.filter((tile) => tile.waiting > 0 && tileAge(tile.oldestAt).state === 'overdue');
  const first = oldest[0];
  const firstState = first ? ageState(ageInDays(first.at), clock) : undefined;

  return (
    <OpsShell
      actor={guard.actor}
      title="صف‌ها"
      pathname="/assoc"
      nav={ASSOC_NAV}
      meta={
        <p className="hz-page-header__meta">
          <span className="hz-page-header__meta-item">محیط عملیاتی انجمن</span>
          <span className="hz-page-header__meta-item">
            {open.toLocaleString('fa-IR') + ' پرونده باز در ' + busy.length.toLocaleString('fa-IR') + ' صف'}
          </span>
          <span className="hz-page-header__meta-item">{'به‌روزشده ' + whenFa(new Date())}</span>
        </p>
      }
      actions={
        first ? (
          <ButtonLink tone="secondary" size="sm" href={first.href}>
            باز کردن قدیمی‌ترین پرونده
          </ButtonLink>
        ) : undefined
      }
    >
      <section aria-labelledby="assoc-tiles">
        <h2 className="hz-visually-hidden" id="assoc-tiles">
          صف‌های انجمن
        </h2>
        <QueueTiles
          testId="assoc-queues"
          tiles={tiles.map((tile) => {
            const age = tileAge(tile.oldestAt);
            return {
              href: tile.href,
              name: tile.titleFa,
              count: tile.waiting,
              oldestDays: age.days,
              age: age.state,
              title: tile.noteFa,
              testId: 'open-queue-' + tile.key,
              countTestId: 'queue-count-' + tile.key,
            };
          })}
        />
      </section>

      <section className="space-y-md" aria-labelledby="assoc-summary">
        <SectionHeader title="خلاصه پرونده‌ها" size="sm" id="assoc-summary" />
        <StatTiles
          tiles={[
            { label: 'پرونده‌های باز', value: open, sub: 'همه با انجمن، در ' + busy.length.toLocaleString('fa-IR') + ' صف', href: '#queue' },
            clock.overdueDays === null
              ? { label: 'از مهلت گذشته', value: null, state: 'unset', reason: 'مهلت بررسی در تنظیمات تعیین نشده است.', href: '/admin/settings' }
              : {
                  label: 'از مهلت گذشته',
                  value: overdueTiles.length,
                  sub: overdueTiles.length === 0 ? 'هیچ صفی از مهلت نگذشته است' : undefined,
                  alert:
                    first && firstState === 'overdue'
                      ? first.kindFa + (first.nameFa ? ' ' + first.nameFa : '') + '، ' + (ageInDays(first.at) ?? 0).toLocaleString('fa-IR') + ' روز در صف'
                      : undefined,
                  href: first && firstState === 'overdue' ? first.href : '#queue',
                },
            { label: 'تخصیص‌نیافته', value: null, state: 'unset', reason: 'مدل تخصیص پرونده به کارشناس هنوز ساخته نشده است.' },
            { label: 'صف‌های خالی', value: tiles.length - busy.length, sub: 'از ' + tiles.length.toLocaleString('fa-IR') + ' صف' },
          ]}
        />
      </section>

      <section className="hz-card hz-card--compact space-y-md" id="queue" aria-labelledby="assoc-old">
        <SectionHeader title="پرونده‌های قدیمی" size="sm" id="assoc-old" />
        {oldest.length === 0 ? (
          <EmptyState title="پرونده‌ای منتظر نیست" description="پرونده تازه پس از ارسال کاربر در صف‌ها می‌آید." />
        ) : (
          <CaseQueue
            label="پنج پرونده قدیمی صف انجمن، قدیمی‌ترین بالا"
            showCode={false}
            showType
            rows={oldest.map((row) => {
              const days = ageInDays(row.at);
              return {
                id: row.id,
                href: row.href,
                name: row.nameFa ?? row.kindFa,
                ageDays: days,
                age: ageState(days, clock),
                type: row.kindFa,
                status: statusOf(row.status)?.labelFa ? { key: row.status } : { tone: 'info', label: 'در انتظار بررسی انجمن' },
                owner: row.owner,
                ownerIsUs: true,
                openLabel: 'باز کردن پرونده ' + (row.nameFa ?? row.kindFa),
                testId: 'old-case',
              };
            })}
            extraLabel="مسئول"
          />
        )}
      </section>

      <section className="hz-card hz-card--compact space-y-md" aria-labelledby="assoc-decisions">
        <SectionHeader title="تصمیم‌های اخیر" size="sm" id="assoc-decisions" />
        {decisions.length === 0 ? (
          <EmptyState title="هنوز تصمیمی ثبت نشده است" description="هر تصمیم انجمن با دلیل و تصمیم‌گیرنده اینجا می‌آید." />
        ) : (
          <div className="hz-table-wrap">
            <table className="hz-table hz-table--dense hz-table--stack" data-testid="assoc-decisions">
              <caption className="hz-visually-hidden">تصمیم‌های اخیر انجمن، جدیدترین بالا</caption>
              <thead>
                <tr>
                  <th scope="col">زمان</th>
                  <th scope="col">پرونده</th>
                  <th scope="col">تصمیم</th>
                  <th scope="col">دلیل</th>
                  <th scope="col">تصمیم‌گیرنده</th>
                </tr>
              </thead>
              <tbody>
                {decisions.map((row) => (
                  <tr key={row.id}>
                    <td data-label="زمان" className="whitespace-nowrap">
                      <time dateTime={row.at.toISOString()}>{whenFa(row.at)}</time>
                    </td>
                    <td className="hz-table__lead">{DECISION_SUBJECT_FA[row.targetType] ?? 'پرونده'}</td>
                    <td data-label="تصمیم">{row.status && statusOf(row.status)?.labelFa ? <StatusBadge status={row.status} size="sm" /> : '—'}</td>
                    <td data-label="دلیل">
                      {row.reason ? <span className="hz-case__sub">{row.reason}</span> : <span className="text-text-secondary">بدون دلیل ثبت‌شده</span>}
                    </td>
                    <td data-label="تصمیم‌گیرنده">{row.actorNameFa ?? 'همزیست'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-caption text-text-secondary">
          تاریخچه کامل هر پرونده در «سابقه پرونده» میز همان صف است.{' '}
          <Link className="hz-link" href="/assoc/kyc">
            رفتن به صف احراز هویت
          </Link>
        </p>
      </section>
    </OpsShell>
  );
}
