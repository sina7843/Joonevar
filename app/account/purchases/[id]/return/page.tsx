import { guardRoute } from '../../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { PaymentResult } from '../../../../../src/ui/payment-result.tsx';
import { db } from '../../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a deposit — PROMPT-005 (P08 return).
 *
 * The verification is what reserves the animal: the request becomes the deal,
 * the advert becomes RESERVED and the other requests are closed, all inside the
 * transaction this call opens. Coming back to this page proves nothing by
 * itself, which is why the gateway is asked again here.
 */
export default async function DepositReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/account/purchases');
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

  const facts = [{ key: 'خدمت', value: 'بیعانه خرید حیوان' }];
  const back = (
    <ButtonLink href={'/account/purchases/' + id} block tone={outcome.state === 'PAID' ? 'primary' : 'secondary'} data-testid="back-to-thread">
      بازگشت به گفت‌وگوی این خرید
    </ButtonLink>
  );

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت بیعانه" pathname="/account/purchases">
      {outcome.state === 'PAID' ? (
        <PaymentResult
          state="PAID"
          testId="deposit-result"
          title="بیعانه تأیید شد و حیوان رزرو شد"
          facts={facts}
          next={['از این لحظه اطلاعات تماس طرف مقابل در گفت‌وگو در دسترس است و سایر درخواست‌های این آگهی بسته شده‌اند.']}
          actions={back}
        />
      ) : outcome.state === 'FAILED' ? (
        <PaymentResult state="FAILED" testId="deposit-result" title="پرداخت تأیید نشد" facts={facts} actions={back}>
          {outcome.reasonFa} درخواست و مبلغ منجمدشده آن حفظ شده است و تا پایان مهلت می‌توانید دوباره تلاش کنید.
        </PaymentResult>
      ) : outcome.state === 'CANCELLED' ? (
        <PaymentResult state="CANCELLED" testId="deposit-result" title="پرداخت لغو شد" facts={facts} actions={back}>
          درخواست شما حفظ شده است و تا پایان مهلت قابل پرداخت است.
        </PaymentResult>
      ) : (
        <PaymentResult state="UNKNOWN" testId="deposit-result" title="این بازگشت از درگاه شناسایی نشد" actions={back}>
          اگر مبلغی از حساب شما کم شده است، از صفحه گفت‌وگو وضعیت پرداخت را دوباره بررسی کنید.
        </PaymentResult>
      )}
    </PublicShell>
  );
}
