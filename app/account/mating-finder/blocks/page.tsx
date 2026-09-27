import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
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
    <PublicShell actor={guard.actor} title="کاربران مسدودشده" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">کاربران مسدودشده در جفت‌یابی</h1>
          <p className="mt-xs text-caption text-text-secondary">
            شما و کاربر مسدودشده پروفایل‌های یکدیگر را نمی‌بینید، درخواست نمی‌فرستید و پیام نمی‌دهید. برداشتن مسدودی
            درخواست‌های بسته‌شده را باز نمی‌کند.
          </p>
        </Card>
        {rows.length === 0 ? (
          <EmptyState title="کسی را مسدود نکرده‌اید" description="از صفحه یک درخواست یا پروفایل می‌توانید کاربری را مسدود کنید." />
        ) : (
          <Card>
            <ul className="space-y-sm" data-testid="finder-blocks">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm">
                  <span className="text-body-sm">{r.labelFa + ' · ' + formatInstantFa(r.createdAt)}</span>
                  <UnblockForm blockId={r.id} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </PublicShell>
  );
}
