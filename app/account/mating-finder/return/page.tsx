import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a finder subscription. Landing here proves
 * nothing: the server verifies, and the period starts inside that transaction.
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

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت اشتراک" pathname="/account/mating-finder">
      <Card>
        {outcome.state === 'PAID' ? (
          <div data-testid="finder-paid">
            <Alert tone="success" title="پرداخت تأیید شد و اشتراک ثبت است">
              تأیید روی سرور انجام شد. اگر اشتراک فعالی داشتید، دوره تازه از پایان همان دوره شروع می‌شود.
            </Alert>
          </div>
        ) : outcome.state === 'CANCELLED' ? (
          <div data-testid="finder-cancelled">
            <Alert tone="info" title="پرداخت لغو شد">
              مبلغ این خرید ثابت مانده است و می‌توانید همان خرید را دوباره ادامه دهید.
            </Alert>
          </div>
        ) : outcome.state === 'FAILED' ? (
          <div data-testid="finder-failed">
            <Alert tone="error" title="پرداخت تأیید نشد">
              {outcome.reasonFa}
            </Alert>
          </div>
        ) : (
          <div data-testid="finder-unknown">
            <Alert tone="warning" title="این نشانی بازگشت شناخته نشد">
              اگر پرداختی انجام داده‌اید، از صفحه اشتراک جفت‌یابی وضعیت آن را ببینید.
            </Alert>
          </div>
        )}
        <div className="mt-lg">
          <ButtonLink href="/account/mating-finder" data-testid="back-to-finder">
            بازگشت به اشتراک جفت‌یابی
          </ButtonLink>
        </div>
      </Card>
    </PublicShell>
  );
}
