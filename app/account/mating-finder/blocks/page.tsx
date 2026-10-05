import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { Icon } from '../../../../src/ui/icon.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { formatInstantFa } from '../../../../src/content/model.ts';
import { myBlocks } from '../../../../src/finder/sanctions.ts';
import { UnblockForm } from '../../../../src/finder/ops-forms.tsx';

export const dynamic = 'force-dynamic';

/** The people this owner blocked in the finder — PHASE-4 PROMPT-007. Only a masked label is shown. */
export default async function FinderBlocksPage() {
  const guard = await guardRoute('/account/mating-finder/blocks');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const rows = await myBlocks(db(), guard.actor);
  return (
    <PublicShell
      actor={guard.actor}
      title="کاربران مسدودشده"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="کاربران مسدودشده"
          back={{ href: '/account/mating-finder' }}
          meta={[
            ...(rows.length > 0 ? [rows.length.toLocaleString('fa-IR') + ' کاربر'] : []),
            'شما و کاربر مسدودشده پروفایل‌های یکدیگر را نمی‌بینید، درخواست نمی‌فرستید و پیام نمی‌دهید. برداشتن مسدودی درخواست‌های بسته‌شده را باز نمی‌کند.',
          ]}
        />
      }
    >
      <div className="space-y-lg">
        {rows.length === 0 ? (
          <EmptyState title="کسی را مسدود نکرده‌اید" description="از صفحه یک درخواست یا پروفایل می‌توانید کاربری را مسدود کنید." />
        ) : (
          <ul className="hz-cardlist" data-testid="finder-blocks">
            {rows.map((r) => (
              <li key={r.id} className="hz-cardlist__item">
                <div className="hz-cardlist__row">
                  <span className="min-w-0">
                    <span className="hz-cardlist__title inline-flex items-center gap-xs">
                      <Icon name="prohibit" size="sm" className="text-text-secondary" />
                      {r.labelFa}
                    </span>
                    <span className="hz-cardlist__meta block">{'مسدود از ' + formatInstantFa(r.createdAt)}</span>
                  </span>
                  <UnblockForm blockId={r.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
