import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { db } from '../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a seller plan — PROMPT-008.
 *
 * The verification is what starts the period and what makes the store active.
 * Coming back to this page proves nothing by itself, which is why the gateway
 * is asked again here.
 */
export default async function SellerPlanReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const guard = await guardRoute('/account/seller');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(
        db(),
        { reference, providerRef: providerRef ?? null },
        await currentPaymentGateway(),
        paidEffects,
      )
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت پلن فروشندگی" pathname="/account/seller">
      <div className="space-y-lg p-lg">
        <Card>
          <div data-testid="plan-payment-result">
            {outcome.state === 'PAID' ? (
              <Alert tone="success" title="پرداخت تأیید شد و دوره پلن آغاز شد">
                فروشگاه شما فعال شد و می‌تواند فعالیت کند.
              </Alert>
            ) : null}
            {outcome.state === 'FAILED' ? (
              <Alert tone="error" title="پرداخت تأیید نشد">
                {outcome.reasonFa} پرونده فروشگاه و مبلغ منجمدشده حفظ شده است و می‌توانید دوباره تلاش کنید.
              </Alert>
            ) : null}
            {outcome.state === 'CANCELLED' ? (
              <Alert tone="warning" title="پرداخت لغو شد">
                پرونده فروشگاه حفظ شده است و خرید پلن دوباره قابل انجام است.
              </Alert>
            ) : null}
            {outcome.state === 'UNKNOWN_REFERENCE' ? (
              <Alert tone="warning" title="این بازگشت از درگاه شناسایی نشد">
                اگر مبلغی از حساب شما کم شده است، از صفحه فروشگاه وضعیت پلن را دوباره بررسی کنید.
              </Alert>
            ) : null}
          </div>
          <p className="mt-lg text-caption">
            <Link href="/account/seller" className="text-text-brand" data-testid="back-to-seller">
              بازگشت به فروشگاه من
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
