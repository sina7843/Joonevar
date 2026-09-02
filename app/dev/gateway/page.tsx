import { notFound } from 'next/navigation';
import { env } from '../../../src/config/env.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Logo } from '../../../src/ui/logo.tsx';

export const dynamic = 'force-dynamic';

/**
 * Development gateway page.
 *
 * Stands in for the bank page during development so the payment flow can be
 * exercised end to end. It only records a decision; the application still has to
 * verify that decision on the server before anything is marked paid.
 *
 * Outside development with local integrations this page does not exist.
 */
export default async function DevGatewayPage({
  searchParams,
}: {
  searchParams: Promise<{ reference?: string; amountRial?: string; callback?: string }>;
}) {
  const current = env();
  if (current.APP_ENV === 'production' || current.INTEGRATION_MODE !== 'local') notFound();

  const { reference, amountRial, callback } = await searchParams;
  if (!reference || !amountRial || !callback) notFound();

  return (
    <main className="mx-auto max-w-md space-y-lg p-lg">
      <div className="flex flex-col items-center gap-md">
        <Logo height={28} />
        <h1 className="text-h4">درگاه آزمایشی توسعه</h1>
        <p className="text-center text-caption text-status-warning-text">
          این صفحه درگاه واقعی نیست و فقط در محیط توسعه وجود دارد.
        </p>
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-sm text-body-sm">
          <dt className="text-text-secondary">شناسه پرداخت</dt>
          <dd>
            <bdi className="hz-ltr font-mono">{reference}</bdi>
          </dd>
          <dt className="text-text-secondary">مبلغ (ریال)</dt>
          <dd>
            <bdi className="hz-ltr font-mono" data-testid="gateway-amount-rial">
              {amountRial}
            </bdi>
          </dd>
        </dl>

        <div className="mt-lg flex flex-row gap-md">
          <form action="/api/dev/gateway" method="post">
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="amountRial" value={amountRial} />
            <input type="hidden" name="callback" value={callback} />
            <input type="hidden" name="decision" value="paid" />
            <button
              type="submit"
              className="min-h-[var(--size-control-md)] rounded-md bg-action-primary-default px-lg text-label-md text-action-primary-on"
              data-testid="gateway-pay"
            >
              پرداخت موفق
            </button>
          </form>
          <form action="/api/dev/gateway" method="post">
            <input type="hidden" name="reference" value={reference} />
            <input type="hidden" name="amountRial" value={amountRial} />
            <input type="hidden" name="callback" value={callback} />
            <input type="hidden" name="decision" value="failed" />
            <button
              type="submit"
              className="min-h-[var(--size-control-md)] rounded-md border border-border-brand px-lg text-label-md"
              data-testid="gateway-fail"
            >
              پرداخت ناموفق
            </button>
          </form>
        </div>
      </Card>
    </main>
  );
}
