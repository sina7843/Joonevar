import { guardRoute } from '../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { db } from '../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a licence period — Phase 2.5 PROMPT-008.
 *
 * Landing here proves nothing: the page runs the server-side verification and
 * reports what that call actually found. The licensed tag and the active period
 * are made inside that verification, never by this page.
 */
export default async function VetLicencePeriodReturnPage({ searchParams }: { searchParams: Promise<{ reference?: string; providerRef?: string }> }) {
  const guard = await guardRoute('/account/vet-profile/return');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const { reference, providerRef } = await searchParams;
  const outcome = reference
    ? await verifyAttempt(db(), { reference, providerRef: providerRef ?? null }, await currentPaymentGateway(), paidEffects)
    : ({ state: 'UNKNOWN_REFERENCE' } as const);

  return (
    <PublicShell actor={guard.actor} title="نتیجه پرداخت دوره فعالیت" pathname="/account/vet-profile/return">
      <div className="space-y-lg">
        {outcome.state === 'PAID' ? (
          <div data-testid="licence-period-paid">
            <Alert tone="success" title="پرداخت تأیید شد">
              دوره فعالیت پروانه شما ثبت شد و Tag «دارای پروانه فعالیت» فعال است.
            </Alert>
          </div>
        ) : null}

        {outcome.state === 'FAILED' ? (
          <div data-testid="licence-period-failed">
            <Alert tone="error" title="پرداخت تأیید نشد">
              {outcome.reasonFa + ' مدارک و تأیید پروانه شما حفظ شده است و می‌توانید دوباره تلاش کنید.'}
            </Alert>
          </div>
        ) : null}

        {outcome.state === 'CANCELLED' ? (
          <Alert tone="warning" title="پرداخت لغو شد">
            مبلغ ثبت‌شده همان است و می‌توانید دوباره از پروفایل دامپزشکی اقدام کنید.
          </Alert>
        ) : null}

        {outcome.state === 'UNKNOWN_REFERENCE' ? (
          <Alert tone="error" title="این بازگشت پرداخت شناسایی نشد">
            هیچ پرداختی با این شناسه پیدا نشد. اگر مبلغی از حساب شما کسر شده، از پشتیبانی پیگیری کنید.
          </Alert>
        ) : null}

        <Card>
          <p className="text-body-sm text-text-secondary">وضعیت پرداخت فقط بر اساس تأیید سرور اعلام می‌شود؛ رسیدن به این صفحه به‌تنهایی سند پرداخت نیست.</p>
          <div className="mt-lg">
            <ButtonLink href="/account/vet-profile" block>
              بازگشت به پروفایل دامپزشکی
            </ButtonLink>
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
