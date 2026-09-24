import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { OpsShell, ASSOC_NAV } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
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
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">تأیید کلاب‌ها</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            تأیید اولیه کلاب و تصمیم درباره مالکیت آن با انجمن است. هر تصمیم دلیل می‌خواهد و در تاریخچه می‌ماند.
          </p>
        </Card>

        <Card>
          <h2 className="text-label-lg">در انتظار بررسی</h2>
          {queue.waiting.length === 0 ? (
            <div className="mt-md">
              <EmptyState title="کلابی در انتظار بررسی نیست" description="کلاب‌های تازه پس از تکمیل معرفی و راه ارتباطی به این صف می‌آیند." />
            </div>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="club-verification-queue">
              {queue.waiting.map((club) => (
                <li key={club.id}>
                  <Link
                    href={'/assoc/clubs/' + club.id}
                    className="block rounded-lg border border-border-subtle p-lg hover:border-border-brand"
                    data-testid={'club-queue-' + club.id}
                  >
                    <p className="text-label-lg">{club.displayNameFa}</p>
                    <p className="mt-2xs text-caption text-text-secondary">{'آخرین تغییر: ' + formatInstantFa(club.updatedAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">درخواست‌های مالکیت</h2>
          {queue.requests.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">درخواست بازی درباره مالکیت کلاب‌ها نیست.</p>
          ) : (
            <ul className="mt-md space-y-md" data-testid="club-ownership-queue">
              {queue.requests.map((row) => (
                <li key={row.request.id} className="space-y-sm rounded-lg border border-border-subtle p-lg">
                  <div className="flex flex-wrap items-center justify-between gap-sm">
                    <p className="text-label-lg">{row.club.displayNameFa}</p>
                    <StatusBadge tone="warning">{CLUB_OWNERSHIP_KIND_FA[row.request.kind as ClubOwnershipKind]}</StatusBadge>
                  </div>
                  {row.request.reasonFa ? <p className="text-body-sm text-text-secondary">{row.request.reasonFa}</p> : null}
                  <p className="text-caption text-text-secondary">{'ثبت: ' + formatInstantFa(row.request.createdAt)}</p>
                  <ClubOwnershipDecisionForm requestId={row.request.id} version={row.request.version} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </OpsShell>
  );
}
