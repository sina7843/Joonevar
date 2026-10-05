import { guardRoute } from '../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { PaymentResult } from '../../../../src/ui/payment-result.tsx';
import { db } from '../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a seller plan — PROMPT-008 (P08 return).
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

  const facts = [{ key: 'خدمت', value: 'پلن فروشندگی' }];
  const back = (
    <ButtonLink href="/account/seller" block tone={outcome.state === 'PAID' ? 'primary' : 'secondary'} data-testid="back-to-seller">
      بازگشت به فروشگاه من
    </ButtonLink>
  );

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت پلن فروشندگی" pathname="/account/seller">
      {outcome.state === 'PAID' ? (
        <PaymentResult
          state="PAID"
          testId="plan-payment-result"
          title="پرداخت تأیید شد و دوره پلن آغاز شد"
          facts={facts}
          next={['فروشگاه شما فعال شد و می‌تواند فعالیت کند.']}
          actions={back}
        />
      ) : outcome.state === 'FAILED' ? (
        <PaymentResult state="FAILED" testId="plan-payment-result" title="پرداخت تأیید نشد" facts={facts} actions={back}>
          {outcome.reasonFa} پرونده فروشگاه و مبلغ منجمدشده حفظ شده است و می‌توانید دوباره تلاش کنید.
        </PaymentResult>
      ) : outcome.state === 'CANCELLED' ? (
        <PaymentResult state="CANCELLED" testId="plan-payment-result" title="پرداخت لغو شد" facts={facts} actions={back}>
          پرونده فروشگاه حفظ شده است و خرید پلن دوباره قابل انجام است.
        </PaymentResult>
      ) : (
        <PaymentResult state="UNKNOWN" testId="plan-payment-result" title="این بازگشت از درگاه شناسایی نشد" actions={back}>
          اگر مبلغی از حساب شما کم شده است، از صفحه فروشگاه وضعیت پلن را دوباره بررسی کنید.
        </PaymentResult>
      )}
    </PublicShell>
  );
}
