import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, ViewChips } from '../../../src/ui/desk.tsx';
import { ageInDays, keyStatus } from '../../../src/ui/queue.tsx';
import { vetCaseKey } from '../vet-case-key.ts';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { trustedCaseQueuePage } from '../../../src/vets/trusted-application.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { readQueueQuery } from '../../../src/domain/queue-query.ts';
import { QueueFrame, hrefWith } from '../../../src/ui/queue-head.tsx';

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
export default async function AssocVetTrustedPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; q?: string; sort?: string; page?: string }>;
}) {
  const guard = await guardRoute('/assoc/vet-trusted');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const params = await searchParams;
  const view = VIEWS.some((item) => item.key === params.view) ? params.view! : 'OPEN';
  // P09: oldest first while waiting; decided cases newest first unless the operator picks an order.
  const defaultSort = view === 'DECIDED' ? 'newest' : 'oldest';
  const query = readQueueQuery(params, defaultSort);
  const page = await trustedCaseQueuePage(db(), guard.actor, { view, page: query.page, q: query.q, sort: query.sort });
  const keep = { view: view === 'OPEN' ? undefined : view, q: query.q, sort: query.sort === defaultSort ? undefined : query.sort };

  return (
    <OpsShell actor={guard.actor} title="درخواست‌های دامپزشک معتمد" pathname="/assoc/vet-trusted" nav={ASSOC_NAV}>
      <QueueFrame
        path="/assoc/vet-trusted"
        params={keep}
        query={query}
        page={page}
        all={page.all}
        defaultSort={defaultSort}
        noun="درخواست"
        searchLabel="جست‌وجوی نام دامپزشک"
        testId="trusted-queue-frame"
        chips={
          <ViewChips
            chips={VIEWS.map((item) => ({
              key: item.key,
              href: hrefWith('/assoc/vet-trusted', { view: item.key, q: query.q }),
              label: item.labelFa,
              current: item.key === view,
              testId: 'trusted-view-' + item.key,
            }))}
          />
        }
      >
        {page.all === 0 ? (
          <EmptyState title="درخواستی در این نما نیست" description="درخواست معتمد فقط از دامپزشکی با پروانه فعال و عضویت معتبر ثبت می‌شود." />
        ) : page.total === 0 ? (
          <EmptyState title="نتیجه‌ای پیدا نشد" description="عبارت جست‌وجو را تغییر دهید یا پاک کنید." />
        ) : (
          <CaseList label="صف پرونده‌ها" testId="trusted-queue">
            {page.items.map((item) => (
              <CaseItem
                key={item.id}
                name={item.displayNameFa ?? '—'}
                href={'/assoc/vet-trusted/' + item.id}
                linkLabel="بررسی درخواست"
                linkTestId="open-trusted-case"
                sub={<>{'نسخه ' + item.submissionVersion.toLocaleString('fa-IR') + ' · ' + formatInstantFa(new Date(item.updatedAt))}</>}
                ageDays={ageInDays(new Date(item.firstSubmittedAt ?? item.updatedAt))}
                status={keyStatus(vetCaseKey(item.status))}
                owner={item.status === 'NEEDS_CORRECTION' ? 'USER' : item.status === 'SUBMITTED' || item.status === 'UNDER_REVIEW' ? 'ASSOCIATION' : null}
                ownerIsUs
              />
            ))}
          </CaseList>
        )}
      </QueueFrame>
    </OpsShell>
  );
}
