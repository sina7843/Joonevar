import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { Card } from '../../src/ui/card.tsx';
import { Identifier } from '../../src/ui/status.tsx';
import { CONTEXT_LABEL_FA } from '../../src/ui/role-switcher.tsx';
import { switchableContexts } from '../../src/authz/actor.ts';

export const dynamic = 'force-dynamic';

/**
 * Profile. Account, KYC and membership are five separate concepts (§4); this
 * page shows only what the foundation actually knows — the account identifier
 * and which contexts the account may enter. Profile editing arrives in
 * PROMPT-004.
 */
export default async function ProfilePage() {
  const guard = await guardRoute('/profile');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  return (
    <PublicShell actor={actor} title="پروفایل" pathname="/profile">
      <div className="space-y-lg">
        <Card>
          <h2 className="text-label-lg">حساب</h2>
          <p className="mt-md text-body-sm">
            <Identifier label="شناسه حساب:" value={actor.accountId} />
          </p>
          <p className="mt-sm text-caption text-text-secondary">
            نقش فعال: {CONTEXT_LABEL_FA[actor.context]}
          </p>
        </Card>

        <Card>
          <h2 className="text-label-lg">نقش‌های در دسترس</h2>
          <ul className="mt-md space-y-xs text-body-sm">
            {switchableContexts(actor.activeRoles).map((context) => (
              <li key={context}>{CONTEXT_LABEL_FA[context]}</li>
            ))}
          </ul>
          <p className="mt-md text-caption text-text-secondary">
            محیط‌های عملیاتی انجمن، مرکز ژنتیک و سوپرادمین جدا هستند و در این فهرست نمایش داده نمی‌شوند.
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
