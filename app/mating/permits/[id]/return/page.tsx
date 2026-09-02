import { guardRoute } from '../../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../../src/ui/button.tsx';
import { db } from '../../../../../src/db/client.ts';
import { env } from '../../../../../src/config/env.ts';
import { paymentGateway } from '../../../../../src/adapters/registry.ts';
import { verifyAttempt } from '../../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a mating permit (§16 step 7, §22, §26).
 *
 * A verified payment opens the final submit. It does not issue a permit, and it
 * never moves the case to the unpaid personal declaration route.
 */
export default async function PermitReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/mating/permits/' + id + '/return');
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
    <PublicShell
      actor={guard.actor}
      title="نتیجه پرداخت مجوز جفت‌گیری"
      pathname={'/mating/permits/' + id + '/return'}
    >
      <div className="space-y-lg">
        {outcome.state === 'PAID' ? (
          <Alert tone="success" title="پرداخت تأیید شد">
            حالا می‌توانید پرونده را برای بررسی عملیاتی ارسال کنید؛ صدور مجوز پس از بررسی انجام می‌شود.
          </Alert>
        ) : null}
        {outcome.state === 'FAILED' ? (
          <Alert tone="error" title="پرداخت تأیید نشد">
            {outcome.reasonFa} اطلاعات پرونده و توافق تقسیم حفظ شده است.
          </Alert>
        ) : null}
        {outcome.state === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت لغو شد">
            پرونده و توافق تقسیم حفظ شده است و می‌توانید دوباره تلاش کنید.
          </Alert>
        ) : null}
        {outcome.state === 'UNKNOWN_REFERENCE' ? (
          <Alert tone="error" title="این بازگشت پرداخت شناسایی نشد">
            هیچ پرداختی با این شناسه پیدا نشد.
          </Alert>
        ) : null}

        <Card>
          <p className="text-body-sm text-text-secondary">
            وضعیت پرداخت فقط با تأیید سرور اعلام می‌شود؛ رسیدن به این صفحه به‌تنهایی سند پرداخت نیست.
          </p>
          <div className="mt-lg">
            <ButtonLink href={'/mating/permits/' + id} block data-testid="back-to-permit">
              بازگشت به پرونده مجوز
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
