import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { PaymentResult } from '../../../../../src/ui/payment-result.tsx';
import { db } from '../../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a shop order — PROMPT-010 (P08 return; the
 * gateway return of checkout, not a product return).
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

  const facts = [{ key: 'خدمت', value: 'سفارش فروشگاه' }];
  const back = (
    <ButtonLink href={'/account/orders/' + id} block tone={outcome.state === 'PAID' ? 'primary' : 'secondary'} data-testid="back-to-order">
      بازگشت به این سفارش
    </ButtonLink>
  );

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت سفارش" pathname="/account/orders">
      {outcome.state === 'PAID' ? (
        <PaymentResult
          state="PAID"
          testId="order-payment-result"
          title="پرداخت سفارش تأیید شد"
          facts={facts}
          next={['کالاها از موجودی فروشندگان کسر شد و سفارش هر فروشگاه جداگانه برای همان فروشگاه ارسال شد.']}
          actions={back}
        />
      ) : outcome.state === 'FAILED' ? (
        <PaymentResult state="FAILED" testId="order-payment-result" title="پرداخت تأیید نشد" facts={facts} actions={back}>
          {outcome.reasonFa} سفارش و کالاهای نگه‌داشته‌شده تا پایان مهلت باقی است و می‌توانید دوباره تلاش کنید.
        </PaymentResult>
      ) : outcome.state === 'CANCELLED' ? (
        <PaymentResult state="CANCELLED" testId="order-payment-result" title="پرداخت لغو شد" facts={facts} actions={back}>
          سفارش شما حفظ شده است و تا پایان مهلت نگه‌داشتن کالاها قابل پرداخت است.
        </PaymentResult>
      ) : (
        <PaymentResult state="UNKNOWN" testId="order-payment-result" title="این بازگشت از درگاه شناسایی نشد" actions={back}>
          اگر مبلغی از حساب شما کم شده است، وضعیت سفارش را از صفحه خود سفارش دوباره بررسی کنید.
        </PaymentResult>
      )}
    </PublicShell>
  );
}
