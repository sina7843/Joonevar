import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';

export const dynamic = 'force-dynamic';

/**
 * Active requests (§8). Each request will carry its status, related animal,
 * next-action owner, deadline when one exists, and a continue CTA that reopens
 * the same case at the same step. Requests are created in PROMPT-007.
 */
export default async function RequestsPage() {
  const guard = await guardRoute('/requests');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  return (
    <PublicShell actor={guard.actor} title="درخواست‌ها" pathname="/requests">
      <EmptyState
        title="درخواستی ثبت نشده است"
        description="درخواست مراجعه، صدور سند و بررسی‌ها پس از ایجاد، همراه وضعیت و مهلت معتبر در این فهرست دیده می‌شوند."
      />
    </PublicShell>
  );
}
