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
 * Return from the gateway for a licence period — Phase 2.5 PROMPT-008 (P08).
 *
 * Landing here proves nothing: the page runs the server-side verification and
 * reports what that call actually found. The licensed tag and the active period
 * are made inside that verification, never by this page.
 */
export default async function VetLicencePeriodReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string; providerRef?: string }> }) {
  const guard = await guardRoute('/account/vet-profile/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(db(), { reference, providerRef: providerRef ?? null }, await currentPaymentGateway(), paidEffects)
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  const facts = [{ key: 'خدمت', value: 'دوره فعالیت پروانه' }];
  const back = (
    <ButtonLink href="/account/vet-profile" block tone={outcome.state === 'PAID' ? 'primary' : 'secondary'}>
      بازگشت به پروفایل دامپزشکی
    </ButtonLink>
  );

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت دوره فعالیت" pathname="/account/vet-profile/return">
      {outcome.state === 'PAID' ? (
        <PaymentResult
          state="PAID"
          testId="licence-period-paid"
          title="پرداخت تأیید شد"
          facts={facts}
          next={['دوره فعالیت پروانه شما ثبت شد و Tag «دارای پروانه فعالیت» فعال است.']}
          actions={back}
        />
      ) : outcome.state === 'FAILED' ? (
        <PaymentResult state="FAILED" testId="licence-period-failed" title="پرداخت تأیید نشد" facts={facts} actions={back}>
          {outcome.reasonFa + ' مدارک و تأیید پروانه شما حفظ شده است و می‌توانید دوباره تلاش کنید.'}
        </PaymentResult>
      ) : outcome.state === 'CANCELLED' ? (
        <PaymentResult state="CANCELLED" title="پرداخت لغو شد" facts={facts} actions={back}>
          مبلغ ثبت‌شده همان است و می‌توانید دوباره از پروفایل دامپزشکی اقدام کنید.
        </PaymentResult>
      ) : (
        <PaymentResult state="UNKNOWN" title="این بازگشت پرداخت شناسایی نشد" actions={back}>
          هیچ پرداختی با این شناسه پیدا نشد. اگر مبلغی از حساب شما کسر شده، از پشتیبانی پیگیری کنید.
        </PaymentResult>
      )}
    </PublicShell>
  );
}
