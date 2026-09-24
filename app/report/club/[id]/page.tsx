import Link from 'next/link';
import { notFound } from 'next/navigation';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { db } from '../../../../src/db/client.ts';
import { reportableClub } from '../../../../src/clubs/service.ts';
import { ClubReportForm } from '../../../../src/clubs/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Reporting one club — Phase 2.5 §8 (PROMPT-012), on the same terms as every
 * other report: a signed-in account, a club the public can actually see, one
 * open report at a time, and the reporter's name never reaches the club.
 */
export default async function ReportClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const path = '/report/club/' + encodeURIComponent(id);
  const guard = await guardRoute(path);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const club = await reportableClub(db(), id);
  if (club === null) notFound();

  return (
    <PublicShell actor={guard.actor} title="گزارش کلاب" pathname={path}>
      <div className="space-y-lg">
        <Card>
          <p className="text-caption text-text-secondary">کلاب</p>
          <h1 className="text-h4">
            <Link href={'/clubs/' + club.publicSlug} className="hover:text-text-brand">
              {club.displayNameFa}
            </Link>
          </h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            گزارش شما به ادمین محتوا می‌رسد و با دلیل بررسی می‌شود. هر حساب برای هر کلاب تا بسته‌شدن بررسی، یک گزارش باز دارد.
          </p>
        </Card>
        <Card>
          <ClubReportForm clubId={club.id} />
        </Card>
      </div>
    </PublicShell>
  );
}
