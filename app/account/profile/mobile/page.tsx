import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { eq } from 'drizzle-orm';
import { accounts } from '../../../../src/db/schema/core.ts';
import { MobileChangeForm } from '../../profile-forms.tsx';

export const dynamic = 'force-dynamic';

/** Mobile change (§6.4). */
export default async function MobileChangePage() {
  const guard = await guardRoute('/account/profile/mobile');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [account] = await db()
    .select({ mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, guard.actor.accountId));

  return (
    <PublicShell actor={guard.actor} title="تغییر شماره موبایل" pathname="/account/profile/mobile">
      <div className="space-y-lg">
        <Alert tone="info" title="شماره فعلی تا تأیید موفق معتبر می‌ماند">
          اگر این مسیر را نیمه‌کاره رها کنید یا کد اشتباه باشد، شماره حساب شما تغییر نمی‌کند.
        </Alert>
        <Card>
          <MobileChangeForm currentMobile={account?.mobile ?? ''} />
        </Card>
      </div>
    </PublicShell>
  );
}
