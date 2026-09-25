import Link from 'next/link';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { db } from '../../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a shop order — PROMPT-010.
 *
 * Arriving here proves nothing, so the gateway is asked again from the server.
 * That one call is what turns every hold in the order into a sale and starts
 * the sub-orders; because the effect runs inside the transaction that settles
 * the attempt, reloading this page, a second tab and a provider retry all find
 * the work already done rather than doing it twice.
 */
export default async function OrderReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/account/orders');
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
    <PublicShell actor={guard.actor} title="نتیجه پرداخت سفارش" pathname="/account/orders">
      <div className="space-y-lg p-lg">
      <Card>
        <div data-testid="order-payment-result">
          {outcome.state === 'PAID' ? (
            <Alert tone="success" title="پرداخت سفارش تأیید شد">
              کالاها از موجودی فروشندگان کسر شد و سفارش هر فروشگاه جداگانه برای همان فروشگاه ارسال شد.
            </Alert>
          ) : null}
          {outcome.state === 'FAILED' ? (
            <Alert tone="error" title="پرداخت تأیید نشد">
              {outcome.reasonFa} سفارش و کالاهای نگه‌داشته‌شده تا پایان مهلت باقی است و می‌توانید دوباره
              تلاش کنید.
            </Alert>
          ) : null}
          {outcome.state === 'CANCELLED' ? (
            <Alert tone="warning" title="پرداخت لغو شد">
              سفارش شما حفظ شده است و تا پایان مهلت نگه‌داشتن کالاها قابل پرداخت است.
            </Alert>
          ) : null}
          {outcome.state === 'UNKNOWN_REFERENCE' ? (
            <Alert tone="warning" title="این بازگشت از درگاه شناسایی نشد">
              اگر مبلغی از حساب شما کم شده است، وضعیت سفارش را از صفحه خود سفارش دوباره بررسی کنید.
            </Alert>
          ) : null}
        </div>
        <p className="mt-lg text-caption">
          <Link href={'/account/orders/' + id} className="text-text-brand" data-testid="back-to-order">
            بازگشت به این سفارش
          </Link>
        </p>
      </Card>
      </div>
    </PublicShell>
  );
}
