import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { paymentGateway } from '../../../src/adapters/registry.ts';
import { verifyAttempt } from '../../../src/billing/payments.ts';
import { paidEffects } from '../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway.
 *
 * Landing here proves nothing. The page runs the server-side verification and
 * reports whatever that call actually found; a browser cannot mark a payment
 * paid (§7, §22, §26).
 */
export default async function MembershipReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const guard = await guardRoute('/membership/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;

  const outcome = reference
    ? await verifyAttempt(
        db(),
        { reference, providerRef: providerRef ?? null },
        paymentGateway(db(), env()),
        paidEffects,
      )
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت" pathname="/membership/return">
      <div className="space-y-lg">
        {outcome.state === 'PAID' ? (
          <Alert tone="success" title="پرداخت تأیید شد">
            تأیید روی سرور انجام شد و عضویت شما فعال است.
          </Alert>
        ) : null}

        {outcome.state === 'FAILED' ? (
          <Alert tone="error" title="پرداخت تأیید نشد">
            {outcome.reasonFa} اطلاعات شما حفظ شده است و می‌توانید دوباره تلاش کنید.
          </Alert>
        ) : null}

        {outcome.state === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت لغو شد">
            اطلاعات شما حفظ شده است و می‌توانید دوباره تلاش کنید.
          </Alert>
        ) : null}

        {outcome.state === 'UNKNOWN_REFERENCE' ? (
          <Alert tone="error" title="این بازگشت پرداخت شناسایی نشد">
            هیچ پرداختی با این شناسه پیدا نشد. اگر مبلغی از حساب شما کسر شده، از پشتیبانی پیگیری کنید.
          </Alert>
        ) : null}

        <Card>
          <p className="text-body-sm text-text-secondary">
            وضعیت پرداخت فقط بر اساس تأیید سرور اعلام می‌شود؛ رسیدن به این صفحه به‌تنهایی سند پرداخت نیست.
          </p>
          <div className="mt-lg">
            <ButtonLink href="/membership" block>
              بازگشت به عضویت
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
