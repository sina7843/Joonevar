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
 * Return from the gateway for puppy cards — §19.4, §22, §26.
 *
 * The verified payment issues each eligible puppy's card on its own; a puppy
 * that is no longer eligible is reported with its reason and the rest still
 * receive their cards.
 */
export default async function CardReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; providerRef?: string; permit?: string }>;
}) {
  const guard = await guardRoute('/puppy-cards/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef, permit } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(
        db(),
        { reference, providerRef: providerRef ?? null },
        await currentPaymentGateway(),
        paidEffects,
      )
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  const back = '/puppy-cards/checkout' + (permit ? '?permit=' + permit : '');

  return (
    <PublicShell
      actor={guard.actor}
      title="نتیجه پرداخت کارت توله"
      pathname="/puppy-cards/return"
      header={<PageHeader title={'نتیجه پرداخت کارت توله'} back={{ href: '/mating/permits' }} />}
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
              <ButtonLink tone="secondary" href={back} data-testid="back-to-cards">
                بازگشت به کارت‌های توله
              </ButtonLink>
            </>
          }
        >
          {outcome.state === 'PAID' ? (
            <>
              کارت هر توله واجد شرایط جداگانه صادر شد؛ اگر تولهای واجد شرایط نبوده باشد، دلیل آن در همان پرونده و
              اعلان‌های شما آمده است.
            </>
          ) : outcome.state === 'FAILED' ? (
            <>{outcome.reasonFa} انتخاب و اطلاعات پرونده حفظ شده است.</>
          ) : outcome.state === 'CANCELLED' ? (
            <>انتخاب شما حفظ شده است و می‌توانید دوباره تلاش کنید.</>
          ) : (
            <>هیچ پرداختی با این شناسه پیدا نشد.</>
          )}
        </PaymentResult>
      </div>
    </PublicShell>
  );
}
