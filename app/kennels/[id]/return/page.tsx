import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { paymentGateway } from '../../../../src/adapters/registry.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

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
        paymentGateway(db(), env()),
        paidEffects,
      )
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت ثبت کنل" pathname={'/kennels/' + id + '/return'}>
      <div className="space-y-lg">
        {outcome.state === 'PAID' ? (
          <Alert tone="success" title="پرداخت تأیید شد">
            حالا می‌توانید پرونده کنل را برای بررسی انجمن ارسال کنید؛ تأیید نهایی با انجمن است.
          </Alert>
        ) : null}
        {outcome.state === 'FAILED' ? (
          <Alert tone="error" title="پرداخت تأیید نشد">
            {outcome.reasonFa} اطلاعات کنل و نژادهای انتخاب‌شده حفظ شده است.
          </Alert>
        ) : null}
        {outcome.state === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت لغو شد">
            اطلاعات کنل حفظ شده است و می‌توانید دوباره تلاش کنید.
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
            <ButtonLink href={'/kennels/' + id} block data-testid="back-to-kennel">
              بازگشت به پرونده کنل
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
