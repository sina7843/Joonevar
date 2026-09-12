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
 * Return from the gateway for an advertising package.
 *
 * Landing here proves nothing: the verification runs on the server and the
 * package is activated inside that same verified transaction (§14, §22).
 */
export default async function PackageReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const guard = await guardRoute('/account/packages/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(db(), { reference, providerRef: providerRef ?? null }, await currentPaymentGateway(), paidEffects)
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت بسته" pathname="/account/packages">
      <div className="space-y-lg">
        <Card>
          {outcome.state === 'PAID' ? (
            <div data-testid="package-paid">
              <Alert tone="success" title="پرداخت تأیید شد و بسته فعال است">
                تأیید روی سرور انجام شد. بازه بسته از همین حالا شمرده می‌شود، مگر بسته فعالی داشته باشید که در آن صورت
                بازه تازه از پایان بسته فعلی شروع می‌شود.
              </Alert>
            </div>
          ) : outcome.state === 'CANCELLED' ? (
            <div data-testid="package-cancelled">
              <Alert tone="info" title="پرداخت لغو شد">
                مبلغ این خرید ثابت مانده است و می‌توانید همان خرید را دوباره ادامه دهید.
              </Alert>
            </div>
          ) : outcome.state === 'FAILED' ? (
            <div data-testid="package-failed">
              <Alert tone="error" title="پرداخت تأیید نشد">
                {outcome.reasonFa}
              </Alert>
            </div>
          ) : (
            <div data-testid="package-unknown">
              <Alert tone="warning" title="این نشانی بازگشت شناخته نشد">
                اگر پرداختی انجام داده‌اید، از صفحه بسته‌ها وضعیت آن را ببینید.
              </Alert>
            </div>
          )}

          <div className="mt-lg">
            <ButtonLink href="/account/packages" data-testid="back-to-packages">
              بازگشت به بسته‌های تبلیغاتی
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
