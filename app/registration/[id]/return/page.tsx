import { guardRoute } from '../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

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
    <PublicShell actor={guard.actor} title="نتیجه پرداخت" pathname={'/registration/' + id + '/return'}>
      <div className="space-y-lg">
        {outcome.state === 'PAID' ? (
          <>
            <Alert tone="success" title="پرداخت تأیید شد">
              تأیید روی سرور انجام شد. مرحله بعدی همین سرویس، انتخاب دامپزشک معتمد و نوع خدمت هر حیوان است؛
              برگه ثبتی پس از تأیید مشخصات، میکروچیپ و نمونه‌گیری خودبه‌خود صادر می‌شود.
            </Alert>
            <ButtonLink
              href="/requests/new?context=MICROCHIP"
              block
              data-testid="continue-to-visit"
            >
              ادامه: انتخاب دامپزشک و دریافت کد مراجعه
            </ButtonLink>
          </>
        ) : null}
        {outcome.state === 'FAILED' ? (
          <Alert tone="error" title="پرداخت تأیید نشد">
            {outcome.reasonFa} حیوان‌های انتخاب‌شده و مبلغ هر قلم حفظ شده است.
          </Alert>
        ) : null}
        {outcome.state === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت لغو شد">
            حیوان‌های انتخاب‌شده و مبلغ هر قلم حفظ شده است و می‌توانید دوباره تلاش کنید.
          </Alert>
        ) : null}
        {outcome.state === 'UNKNOWN_REFERENCE' ? (
          <Alert tone="error" title="این بازگشت پرداخت شناسایی نشد">
            هیچ پرداختی با این شناسه پیدا نشد.
          </Alert>
        ) : null}

        <Card>
          <p className="text-body-sm text-text-secondary">
            وضعیت پرداخت فقط بر اساس تأیید سرور اعلام می‌شود؛ رسیدن به این صفحه به‌تنهایی سند پرداخت نیست.
          </p>
          <div className="mt-lg">
            <ButtonLink href={'/registration/' + id} block data-testid="back-to-batch">
              بازگشت به درخواست
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
