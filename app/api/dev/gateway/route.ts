import { NextResponse } from 'next/server';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { devPaymentOutcomes } from '../../../../src/db/schema/billing.ts';
import { toErrorBody } from '../../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * Records the decision made on the development gateway page.
 *
 * This writes only what the fake bank decided. It never marks a payment paid in
 * the product: the application still runs its own server-side verification when
 * the browser returns. Outside development with local integrations the route
 * answers 404, exactly as if it did not exist.
 */
export async function POST(request: Request) {
  try {
    const current = env();
    if (current.APP_ENV === 'production' || current.INTEGRATION_MODE !== 'local') {
      return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
    }

    const form = await request.formData();
    const reference = String(form.get('reference') ?? '');
    const amountRial = String(form.get('amountRial') ?? '0');
    const callback = String(form.get('callback') ?? '/');
    const paid = String(form.get('decision') ?? '') === 'paid';

    if (reference === '' || !/^[0-9]+$/.test(amountRial)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid request' } }, { status: 422 });
    }

    await db()
      .insert(devPaymentOutcomes)
      .values({ reference, paid: paid ? 'true' : 'false', amountRial })
      .onConflictDoUpdate({
        target: devPaymentOutcomes.reference,
        set: { paid: paid ? 'true' : 'false', amountRial, decidedAt: new Date() },
      });

    const safeCallback = callback.startsWith('/') && !callback.startsWith('//') ? callback : '/membership';
    const separator = safeCallback.includes('?') ? '&' : '?';
    const location = safeCallback + separator + 'reference=' + encodeURIComponent(reference);
    return new NextResponse(null, { status: 303, headers: { Location: location } });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
