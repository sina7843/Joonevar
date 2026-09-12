import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { mergeCandidates, mergedRecords } from '../../../src/admin/merge.ts';
import { MERGE_KIND_FA, MERGE_KIND_PATH, isMergeKind, type MergeKind } from '../../../src/admin/merge-model.ts';
import { MergeForm, MergeKindTabs } from '../../../src/admin/forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Merging duplicate records — Requirements-Phase-2 §21 (PROMPT-016).
 *
 * A merge here keeps everything: the duplicate row, its history and its public
 * address, which from now on points at the primary record. Nothing is deleted
 * and nothing is moved, so the change can be reviewed afterwards.
 */
export default async function AdminMergePage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const guard = await guardRoute('/admin/merge');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const raw = (await searchParams).kind ?? '';
  const kind: MergeKind = isMergeKind(raw) ? raw : 'CENTRE';
  const [options, merged] = await Promise.all([
    mergeCandidates(db(), guard.actor, kind),
    mergedRecords(db(), guard.actor, kind),
  ]);

  return (
    <OpsShell actor={guard.actor} title="سوپرادمین" pathname="/admin/merge" nav={ADMIN_NAV}>
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">ادغام رکورد تکراری</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            رکورد تکراری حذف نمی‌شود: ردیف، تاریخچه و نشانی عمومی‌اش می‌ماند و همان نشانی به رکورد اصلی اشاره می‌کند.
            رکوردی که خودش تکراری ثبت شده دوباره ادغام نمی‌شود تا زنجیره‌ای از هدایت ساخته نشود.
          </p>
          <div className="mt-lg">
            <MergeKindTabs current={kind} />
          </div>
        </Card>

        <Card>
          <h2 className="text-label-lg">{'ثبت تکراری — ' + MERGE_KIND_FA[kind]}</h2>
          {options.length < 2 ? (
            <div className="mt-lg">
              <EmptyState
                title="برای ادغام دست‌کم دو رکورد لازم است"
                description="در این دایرکتوری هنوز دو رکورد ادغام‌نشده وجود ندارد."
              />
            </div>
          ) : (
            <MergeForm kind={kind} options={options} />
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">رکوردهای ادغام‌شده</h2>
          {merged.length === 0 ? (
            <div className="mt-lg">
              <EmptyState title="هنوز رکوردی تکراری ثبت نشده است" description="هر ادغام با دلیلش در تاریخچه می‌ماند." />
            </div>
          ) : (
            <ul className="mt-lg space-y-sm" data-testid="merged-records">
              {merged.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-lg border border-border-subtle p-md"
                  data-testid={'merged-' + row.id}
                >
                  <span className="text-body-sm">
                    {row.nameFa}
                    {row.primary ? ' → ' + row.primary.nameFa : ''}
                  </span>
                  {row.primary?.slug ? (
                    <Link
                      href={MERGE_KIND_PATH[kind] + row.primary.slug}
                      className="text-label-md text-text-brand underline underline-offset-4"
                    >
                      رکورد اصلی
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-lg">
            <Alert tone="info" title="بازبینی">
              هر ادغام در <Link href="/admin/audit" className="text-text-brand underline underline-offset-4">تاریخچه</Link> با
              مقدار قبلی، دلیل و زمانش ثبت شده است.
            </Alert>
          </div>
        </Card>
      </div>
    </OpsShell>
  );
}
