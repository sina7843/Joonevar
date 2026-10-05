import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { CaseItem, CaseList, Panel } from '../../../src/ui/desk.tsx';
import { ageInDays } from '../../../src/ui/queue.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { clubAuthorityQueue } from '../../../src/clubs/service.ts';
import { CLUB_OWNERSHIP_KIND_FA, type ClubOwnershipKind } from '../../../src/clubs/model.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { ClubOwnershipDecisionForm } from '../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * What the association has to decide about clubs — Phase 2.5 §8 (PROMPT-012):
 * the initial verification, and every privileged ownership change (DEC-0198).
 */
export default async function AssocClubsPage() {
  const guard = await guardRoute('/assoc/clubs');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const queue = await clubAuthorityQueue(db(), guard.actor);

  return (
    <OpsShell actor={guard.actor} title="کلاب‌ها" pathname="/assoc/clubs" nav={ASSOC_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          {queue.waiting.length.toLocaleString('fa-IR') + ' کلاب در انتظار تأیید · ' + queue.requests.length.toLocaleString('fa-IR') + ' درخواست مالکیت'}
        </span>
        <span className="hz-page-header__meta-item">
          تأیید اولیه کلاب و تصمیم درباره مالکیت آن با انجمن است. هر تصمیم دلیل می‌خواهد و در تاریخچه می‌ماند.
        </span>
      </p>

      <Panel title="در انتظار بررسی" count={queue.waiting.length.toLocaleString('fa-IR')}>
        {queue.waiting.length === 0 ? (
          <EmptyState title="کلابی در انتظار بررسی نیست" description="کلاب‌های تازه پس از تکمیل معرفی و راه ارتباطی به این صف می‌آیند." />
        ) : (
          <CaseList label="کلاب‌های در انتظار تأیید" testId="club-verification-queue">
            {queue.waiting.map((club) => (
              <CaseItem
                key={club.id}
                name={club.displayNameFa}
                href={'/assoc/clubs/' + club.id}
                linkTestId={'club-queue-' + club.id}
                sub={'آخرین تغییر: ' + formatInstantFa(club.updatedAt)}
                ageDays={ageInDays(club.updatedAt)}
                status={{ tone: 'info', label: 'در انتظار بررسی' }}
                owner="ASSOCIATION"
                ownerIsUs
              />
            ))}
          </CaseList>
        )}
      </Panel>

      <Panel title="درخواست‌های مالکیت" count={queue.requests.length.toLocaleString('fa-IR')}>
        {queue.requests.length === 0 ? (
          <EmptyState title="درخواست بازی درباره مالکیت کلاب‌ها نیست" description="درخواست‌های مالکیت و واگذاری کلاب پس از ثبت مالک اینجا می‌آیند." />
        ) : (
          <CaseList label="درخواست‌های مالکیت کلاب" testId="club-ownership-queue">
            {queue.requests.map((row) => (
              <CaseItem
                key={row.request.id}
                name={row.club.displayNameFa}
                type={CLUB_OWNERSHIP_KIND_FA[row.request.kind as ClubOwnershipKind]}
                sub={(row.request.reasonFa ? row.request.reasonFa + ' · ' : '') + 'ثبت: ' + formatInstantFa(row.request.createdAt)}
                ageDays={ageInDays(row.request.createdAt)}
                status={{ tone: 'info', label: 'در انتظار بررسی' }}
                owner="ASSOCIATION"
                ownerIsUs
              >
                <ClubOwnershipDecisionForm requestId={row.request.id} version={row.request.version} />
              </CaseItem>
            ))}
          </CaseList>
        )}
      </Panel>
    </OpsShell>
  );
}
