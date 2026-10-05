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
 * Return from the gateway for a finder subscription (P08 return). Landing here
 * proves nothing: the server verifies, and the period starts inside that
 * transaction.
 */
export default async function FinderReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const guard = await guardRoute('/account/mating-finder/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(db(), { reference, providerRef: providerRef ?? null }, await currentPaymentGateway(), paidEffects)
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  const facts = [{ key: 'خدمت', value: 'اشتراک جفت‌یابی' }];
  const back = (
    <ButtonLink href="/account/mating-finder" block tone={outcome.state === 'PAID' ? 'primary' : 'secondary'} data-testid="back-to-finder">
      بازگشت به اشتراک جفت‌یابی
    </ButtonLink>
  );

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت اشتراک" pathname="/account/mating-finder">
      {outcome.state === 'PAID' ? (
        <PaymentResult
          state="PAID"
          testId="finder-paid"
          title="پرداخت تأیید شد و اشتراک ثبت است"
          facts={facts}
          next={['اگر اشتراک فعالی داشتید، دوره تازه از پایان همان دوره شروع می‌شود.']}
          actions={back}
        >
          تأیید روی سرور انجام شد.
        </PaymentResult>
      ) : outcome.state === 'CANCELLED' ? (
        <PaymentResult state="CANCELLED" testId="finder-cancelled" title="پرداخت لغو شد" facts={facts} actions={back}>
          مبلغ این خرید ثابت مانده است و می‌توانید همان خرید را دوباره ادامه دهید.
        </PaymentResult>
      ) : outcome.state === 'FAILED' ? (
        <PaymentResult state="FAILED" testId="finder-failed" title="پرداخت تأیید نشد" facts={facts} actions={back}>
          {outcome.reasonFa}
        </PaymentResult>
      ) : (
        <PaymentResult state="UNKNOWN" testId="finder-unknown" title="این نشانی بازگشت شناخته نشد" actions={back}>
          اگر پرداختی انجام داده‌اید، از صفحه اشتراک جفت‌یابی وضعیت آن را ببینید.
        </PaymentResult>
      )}
    </PublicShell>
  );
}
