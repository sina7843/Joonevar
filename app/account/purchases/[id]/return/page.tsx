import Link from 'next/link';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { currentPaymentGateway } from '../../../../../src/adapters/current.ts';
import { AccessDenied } from '../../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../../src/ui/shell.tsx';
import { Card } from '../../../../../src/ui/card.tsx';
import { Alert } from '../../../../../src/ui/alert.tsx';
import { db } from '../../../../../src/db/client.ts';
import { verifyAttempt } from '../../../../../src/billing/payments.ts';
import { paidEffects } from '../../../../../src/billing/effects.ts';

export const dynamic = 'force-dynamic';

/**
 * Return from the gateway for a deposit — PROMPT-005.
 *
 * The verification is what reserves the animal: the request becomes the deal,
 * the advert becomes RESERVED and the other requests are closed, all inside the
 * transaction this call opens. Coming back to this page proves nothing by
 * itself, which is why the gateway is asked again here.
 */
export default async function DepositReturnPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reference?: string; providerRef?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/account/purchases');
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
    <PublicShell actor={guard.actor} title="نتیجه پرداخت بیعانه" pathname="/account/purchases">
      <div className="space-y-lg p-lg">
        <Card>
          <div data-testid="deposit-result">
            {outcome.state === 'PAID' ? (
              <Alert tone="success" title="بیعانه تأیید شد و حیوان رزرو شد">
                از این لحظه اطلاعات تماس طرف مقابل در گفت‌وگو در دسترس است و سایر درخواست‌های این آگهی بسته
                شده‌اند.
              </Alert>
            ) : null}
            {outcome.state === 'FAILED' ? (
              <Alert tone="error" title="پرداخت تأیید نشد">
                {outcome.reasonFa} درخواست و مبلغ منجمدشده آن حفظ شده است و تا پایان مهلت می‌توانید دوباره
                تلاش کنید.
              </Alert>
            ) : null}
            {outcome.state === 'CANCELLED' ? (
              <Alert tone="warning" title="پرداخت لغو شد">
                درخواست شما حفظ شده است و تا پایان مهلت قابل پرداخت است.
              </Alert>
            ) : null}
            {outcome.state === 'UNKNOWN_REFERENCE' ? (
              <Alert tone="warning" title="این بازگشت از درگاه شناسایی نشد">
                اگر مبلغی از حساب شما کم شده است، از صفحه گفت‌وگو وضعیت پرداخت را دوباره بررسی کنید.
              </Alert>
            ) : null}
          </div>
          <p className="mt-lg text-caption">
            <Link href={'/account/purchases/' + id} className="text-text-brand" data-testid="back-to-thread">
              بازگشت به گفت‌وگوی این خرید
            </Link>
          </p>
        </Card>
      </div>
    </PublicShell>
  );
}
