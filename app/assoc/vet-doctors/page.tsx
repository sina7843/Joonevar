import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { vetCaseKey } from '../vet-case-key.ts';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { doctorCaseQueue } from '../../../src/vets/doctor-application.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { readQueueQuery } from '../../../src/domain/queue-query.ts';
import { QueueFrame, hrefWith } from '../../../src/ui/queue-head.tsx';

export const dynamic = 'force-dynamic';

const VIEWS = [
  { key: 'OPEN', labelFa: 'در انتظار بررسی' },
  { key: 'CORRECTION', labelFa: 'منتظر اصلاح متقاضی' },
  { key: 'DECIDED', labelFa: 'تصمیم‌گرفته' },
] as const;
type View = (typeof VIEWS)[number]['key'];

const SCOPE_FA: Record<string, string> = { GENERAL: 'عمومی', SPECIALIST: 'متخصص' };

/**
 * Council-code cases of doctors — Phase 2.5 PROMPT-005.
 *
 * The association admin verifies the council code by hand (PRODUCT_DECISIONS).
 * The oldest waiting case comes first; a claim of an unowned page says so.
 */
export default async function AssocVetDoctorsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; sort?: string; page?: string }>;
}) {
  const guard = await guardRoute('/assoc/vet-doctors');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const params = await searchParams;
  const view: View = VIEWS.some((item) => item.key === params.view) ? (params.view as View) : 'OPEN';
  // P09: oldest first while waiting; decided cases newest first unless the operator picks an order.
  const defaultSort = view === 'DECIDED' ? 'newest' : 'oldest';
  const query = readQueueQuery(params, defaultSort);
  const page = await doctorCaseQueue(db(), guard.actor, { view, page: query.page, q: query.q, sort: query.sort });
  const keep = { view: view === 'OPEN' ? undefined : view, q: query.q, sort: query.sort === defaultSort ? undefined : query.sort };

  return (
    <OpsShell actor={guard.actor} title="کد نظام دامپزشکان" pathname="/assoc/vet-doctors" nav={ASSOC_NAV}>
      <QueueFrame
        path="/assoc/vet-doctors"
        params={keep}
        query={query}
        page={page}
        all={page.all}
        defaultSort={defaultSort}
        searchLabel="جست‌وجوی نام یا کد نظام"
        testId="doctor-queue-frame"
        chips={
          <ViewChips
            chips={VIEWS.map((item) => ({
              key: item.key,
              href: hrefWith('/assoc/vet-doctors', { view: item.key, q: query.q }),
              label: item.labelFa,
              current: item.key === view,
              testId: 'doctor-view-' + item.key,
            }))}
          />
        }
      >
        {page.all === 0 ? (
          <EmptyState title="پرونده‌ای در این نما نیست" description="درخواست‌های دکتر دامپزشک در همین صف دیده می‌شوند." />
        ) : page.total === 0 ? (
          <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا پاک کنید." />
        ) : (
          <CaseList label="صف پرونده‌ها" testId="doctor-queue">
            {page.items.map((item) => (
              <CaseItem
                key={item.id}
                name={item.displayNameFa ?? '—'}
                href={'/assoc/vet-doctors/' + item.id}
                linkLabel="بررسی پرونده"
                linkTestId="open-doctor-case"
                sub={<>{(item.claim ? 'Claim پروفایل بدون مالک · ' : 'پروفایل تازه · ') + (item.practiceScope ? SCOPE_FA[item.practiceScope] + ' · ' : '') + 'کد نظام '}<bdi dir="ltr">{item.councilCode ?? '—'}</bdi>{' · نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}</>}
                ageDays={ageInDays(new Date(item.firstSubmittedAt ?? item.updatedAt))}
                status={keyStatus(vetCaseKey(item.status))}
                owner={view === 'OPEN' ? 'ASSOCIATION' : view === 'CORRECTION' ? 'USER' : null}
                ownerIsUs
              />
            ))}
          </CaseList>
        )}
      </QueueFrame>
    </OpsShell>
  );
}
