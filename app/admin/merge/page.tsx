import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { ADMIN_NAV, OpsShell } from '../../../src/ui/shell.tsx';
import { Panel, ViewChips } from '../../../src/ui/desk.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { mergeCandidates, mergedRecords } from '../../../src/admin/merge.ts';
import { MERGE_KINDS, MERGE_KIND_FA, MERGE_KIND_PATH, isMergeKind, type MergeKind } from '../../../src/admin/merge-model.ts';
import { MergeForm } from '../../../src/admin/forms.tsx';

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
    <OpsShell actor={guard.actor} title="ادغام رکورد تکراری" pathname="/admin/merge" nav={ADMIN_NAV}>
      <p className="hz-page-header__meta">
        <span className="hz-page-header__meta-item">
          رکورد تکراری حذف نمی‌شود: ردیف، تاریخچه و نشانی عمومی‌اش می‌ماند و همان نشانی به رکورد اصلی اشاره می‌کند.
          رکوردی که خودش تکراری ثبت شده دوباره ادغام نمی‌شود تا زنجیره‌ای از هدایت ساخته نشود.
        </span>
      </p>
      <div data-testid="merge-kinds">
        <ViewChips
          label="نوع رکورد"
          chips={MERGE_KINDS.map((value) => ({
            key: value,
            href: '/admin/merge?kind=' + value,
            label: MERGE_KIND_FA[value],
            current: value === kind,
            testId: 'merge-kind-' + value,
          }))}
        />
      </div>

      <div className="hz-desk">
        <Panel title={'ثبت تکراری — ' + MERGE_KIND_FA[kind]}>
          {options.length < 2 ? (
            <EmptyState
              title="برای ادغام دست‌کم دو رکورد لازم است"
              description="در این دایرکتوری هنوز دو رکورد ادغام‌نشده وجود ندارد."
            />
          ) : (
            <MergeForm kind={kind} options={options} />
          )}
        </Panel>

        <Panel title="رکوردهای ادغام‌شده" count={merged.length.toLocaleString('fa-IR')}>
          {merged.length === 0 ? (
            <EmptyState title="هنوز رکوردی تکراری ثبت نشده است" description="هر ادغام با دلیلش در تاریخچه می‌ماند." />
          ) : (
            <ul className="divide-y divide-border-subtle" data-testid="merged-records">
              {merged.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-sm py-sm" data-testid={'merged-' + row.id}>
                  <span className="text-body-sm">
                    <span className="text-text-secondary">{row.nameFa}</span>
                    {row.primary ? (
                      <>
                        {' ← '}
                        <b className="text-label-sm">{row.primary.nameFa}</b>
                      </>
                    ) : null}
                  </span>
                  {row.primary?.slug ? (
                    <Link href={MERGE_KIND_PATH[kind] + row.primary.slug} className="hz-link hz-link--standalone">
                      رکورد اصلی
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-text-secondary">
            هر ادغام در{' '}
            <Link href="/admin/audit" className="hz-link">
              تاریخچه
            </Link>{' '}
            با مقدار قبلی، دلیل و زمانش ثبت شده است.
          </p>
        </Panel>
      </div>
    </OpsShell>
  );
}
