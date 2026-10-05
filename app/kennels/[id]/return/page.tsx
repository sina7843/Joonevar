import { guardRoute } from '../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { PaymentResult } from '../../../../src/ui/payment-result.tsx';
import { Identifier } from '../../../../src/ui/status.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';
import { PageHeader } from '../../../../src/ui/section-header.tsx';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a kennel registration (§15.2, §22, §26).
 *
 * A verified payment opens the submission step; it does not approve the kennel,
 * which the association still reviews.
 */
export default async function KennelReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/kennels/' + id + '/return');
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
      title="نتیجه پرداخت ثبت کنل"
      pathname={'/kennels/' + id + '/return'}
      header={<PageHeader title={'نتیجه پرداخت ثبت کنل'} back={{ href: '/kennels/' + id }} />}
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
              <ButtonLink tone="secondary" href={'/kennels/' + id} data-testid="back-to-kennel">
                بازگشت به پرونده کنل
              </ButtonLink>
            </>
          }
        >
          {outcome.state === 'PAID' ? (
            <>حالا می‌توانید پرونده کنل را برای بررسی انجمن ارسال کنید؛ تأیید نهایی با انجمن است.</>
          ) : outcome.state === 'FAILED' ? (
            <>{outcome.reasonFa} اطلاعات کنل و نژادهای انتخاب‌شده حفظ شده است.</>
          ) : outcome.state === 'CANCELLED' ? (
            <>اطلاعات کنل حفظ شده است و می‌توانید دوباره تلاش کنید.</>
          ) : (
            <>هیچ پرداختی با این شناسه پیدا نشد.</>
          )}
        </PaymentResult>
      </div>
    </PublicShell>
  );
}
