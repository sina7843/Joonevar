import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { paymentGateway } from '../../../src/adapters/registry.ts';
import { verifyAttempt } from '../../../src/billing/payments.ts';
import { paidEffects } from '../../../src/billing/effects.ts';

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
        paymentGateway(db(), env()),
        paidEffects,
      )
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  const back = '/puppy-cards/checkout' + (permit ? '?permit=' + permit : '');

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت کارت توله" pathname="/puppy-cards/return">
      <div className="space-y-lg">
        {outcome.state === 'PAID' ? (
          <Alert tone="success" title="پرداخت تأیید شد">
            کارت هر توله واجد شرایط جداگانه صادر شد؛ اگر تولهای واجد شرایط نبوده باشد، دلیل آن در همان
            پرونده و اعلان‌های شما آمده است.
          </Alert>
        ) : null}
        {outcome.state === 'FAILED' ? (
          <Alert tone="error" title="پرداخت تأیید نشد">
            {outcome.reasonFa} انتخاب و اطلاعات پرونده حفظ شده است.
          </Alert>
        ) : null}
        {outcome.state === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت لغو شد">
            انتخاب شما حفظ شده است و می‌توانید دوباره تلاش کنید.
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
            <ButtonLink href={back} block data-testid="back-to-cards">
              بازگشت به کارت‌های توله
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
