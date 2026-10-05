import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { PaymentResult } from '../../../../src/ui/payment-result.tsx';
import { db } from '../../../../src/db/client.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for an advertising package (P08 return).
 *
 * Landing here proves nothing: the verification runs on the server and the
 * package is activated inside that same verified transaction (§14, §22).
 */
export default async function PackageReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const guard = await guardRoute('/account/packages/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(db(), { reference, providerRef: providerRef ?? null }, await currentPaymentGateway(), paidEffects)
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  const facts = [{ key: 'خدمت', value: 'بسته تبلیغاتی' }];
  const back = (
    <ButtonLink href="/account/packages" block tone={outcome.state === 'PAID' ? 'primary' : 'secondary'} data-testid="back-to-packages">
      بازگشت به بسته‌های تبلیغاتی
    </ButtonLink>
  );

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت بسته" pathname="/account/packages">
      {outcome.state === 'PAID' ? (
        <PaymentResult
          state="PAID"
          testId="package-paid"
          title="پرداخت تأیید شد و بسته فعال است"
          facts={facts}
          next={['بازه بسته از همین حالا شمرده می‌شود، مگر بسته فعالی داشته باشید که در آن صورت بازه تازه از پایان بسته فعلی شروع می‌شود.']}
          actions={back}
        >
          تأیید روی سرور انجام شد.
        </PaymentResult>
      ) : outcome.state === 'CANCELLED' ? (
        <PaymentResult state="CANCELLED" testId="package-cancelled" title="پرداخت لغو شد" facts={facts} actions={back}>
          مبلغ این خرید ثابت مانده است و می‌توانید همان خرید را دوباره ادامه دهید.
        </PaymentResult>
      ) : outcome.state === 'FAILED' ? (
        <PaymentResult state="FAILED" testId="package-failed" title="پرداخت تأیید نشد" facts={facts} actions={back}>
          {outcome.reasonFa}
        </PaymentResult>
      ) : (
        <PaymentResult state="UNKNOWN" testId="package-unknown" title="این نشانی بازگشت شناخته نشد" actions={back}>
          اگر پرداختی انجام داده‌اید، از صفحه بسته‌ها وضعیت آن را ببینید.
        </PaymentResult>
      )}
    </PublicShell>
  );
}
