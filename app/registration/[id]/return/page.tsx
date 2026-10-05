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
 * Return from the gateway for a registration-sheet batch.
 *
 * Landing here proves nothing: the verification runs on the server and the
 * issuance effect runs inside that same verified transaction (§22, §26).
 */
export default async function SheetReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/registration/' + id + '/return');
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
      pathname={'/registration/' + id + '/return'}
      header={<PageHeader title={'نتیجه پرداخت'} back={{ href: '/registration/' + id }} />}
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
              {outcome.state === 'PAID' ? (
                <ButtonLink
                  href="/requests/new?context=MICROCHIP"

                  data-testid="continue-to-visit"
                >
                  ادامه: انتخاب دامپزشک و دریافت کد مراجعه
                </ButtonLink>
              ) : null}
              <ButtonLink tone="secondary" href={'/registration/' + id} data-testid="back-to-batch">
                بازگشت به درخواست
              </ButtonLink>
            </>
          }
        >
          {outcome.state === 'PAID' ? (
            <>
              تأیید روی سرور انجام شد. مرحله بعدی همین سرویس، انتخاب دامپزشک معتمد و نوع خدمت هر حیوان است؛ برگه ثبتی پس
              از تأیید مشخصات، میکروچیپ و نمونه‌گیری خودبه‌خود صادر می‌شود.
            </>
          ) : outcome.state === 'FAILED' ? (
            <>{outcome.reasonFa} حیوان‌های انتخاب‌شده و مبلغ هر قلم حفظ شده است.</>
          ) : outcome.state === 'CANCELLED' ? (
            <>حیوان‌های انتخاب‌شده و مبلغ هر قلم حفظ شده است و می‌توانید دوباره تلاش کنید.</>
          ) : (
            <>هیچ پرداختی با این شناسه پیدا نشد.</>
          )}
        </PaymentResult>
      </div>
    </PublicShell>
  );
}
