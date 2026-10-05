import { guardRoute } from '../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../src/adapters/current.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { PaymentResult } from '../../../src/ui/payment-result.tsx';
import { Identifier } from '../../../src/ui/status.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { verifyAttempt } from '../../../src/billing/payments.ts';
import { paidEffects } from '../../../src/billing/effects.ts';
import { PageHeader } from '../../../src/ui/section-header.tsx';

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
        await currentPaymentGateway(),
        paidEffects,
      )
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  return (
    <PublicShell
      actor={guard.actor}
      title="نتیجه پرداخت"
      pathname="/membership/return"
      header={<PageHeader title={'نتیجه پرداخت'} back={{ href: '/membership' }} />}
    >
      <div className="mx-auto w-full max-w-[560px]">
        <PaymentResult
          state={outcome.state === 'UNKNOWN_REFERENCE' ? 'UNKNOWN' : outcome.state}
          title={
            outcome.state === 'PAID'
              ? 'پرداخت تأیید شد'
              : outcome.state === 'FAILED'
                ? 'پرداخت تأیید نشد'
                : outcome.state === 'CANCELLED'
                  ? 'پرداخت لغو شد'
                  : 'این بازگشت پرداخت شناسایی نشد'
          }
          facts={reference ? [{ key: 'شناسه پرداخت', value: <Identifier value={reference} /> }] : []}
          actions={
            <>
              <ButtonLink tone="secondary" href="/membership">
                بازگشت به عضویت
              </ButtonLink>
            </>
          }
        >
          {outcome.state === 'PAID' ? (
            <>تأیید روی سرور انجام شد و عضویت شما فعال است.</>
          ) : outcome.state === 'FAILED' ? (
            <>{outcome.reasonFa} اطلاعات شما حفظ شده است و می‌توانید دوباره تلاش کنید.</>
          ) : outcome.state === 'CANCELLED' ? (
            <>اطلاعات شما حفظ شده است و می‌توانید دوباره تلاش کنید.</>
          ) : (
            <>هیچ پرداختی با این شناسه پیدا نشد. اگر مبلغی از حساب شما کسر شده، از پشتیبانی پیگیری کنید.</>
          )}
        </PaymentResult>
      </div>
    </PublicShell>
  );
}
