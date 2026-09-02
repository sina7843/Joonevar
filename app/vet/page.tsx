import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { Alert } from '../../src/ui/alert.tsx';

export const dynamic = 'force-dynamic';

/**
 * Trusted veterinarian panel (§21.1). The queue shows only requests assigned to
 * this veterinarian and location; there is no general pool anyone can pick from
 * (D08). Assigned work is created in PROMPT-007.
 */
export default async function VetPage() {
  const guard = await guardRoute('/vet');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  return (
    <PublicShell actor={guard.actor} title="پنل دامپزشک معتمد" pathname="/vet">
      <div className="space-y-lg">
        <Alert tone="info" title="فقط درخواست‌های تخصیص‌یافته">
          هر مراجعه به همین دامپزشک و همین Location تعلق دارد. صف عمومی قابل برداشتن توسط دامپزشک دیگر وجود ندارد.
        </Alert>
        <EmptyState
          title="درخواستی به شما تخصیص نیافته است"
          description="پس از ساخت درخواست مراجعه توسط کاربر، پرونده در همین صف دیده می‌شود."
        />
      </div>
    </PublicShell>
  );
}
