import { db } from '../../../../../src/db/client.ts';
import { guardRoute } from '../../../../../src/authz/guard.ts';
import { toErrorBody } from '../../../../../src/domain/errors.ts';
import { invoicePdf } from '../../../../../src/commerce/invoice.ts';

export const dynamic = 'force-dynamic';

/**
 * The invoice for one order — PROMPT-012.
 *
 * Only the buyer, and only once the payment is verified: an invoice for an
 * order nobody paid for is a receipt for nothing. The download itself is
 * recorded, because a copy of somebody's purchase leaving the system is a
 * read worth keeping.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const guard = await guardRoute('/account/orders');
  if (!guard.ok) {
    const { status, body } = toErrorBody(guard.denied);
    return Response.json(body, { status });
  }
  try {
    const bytes = await invoicePdf(db(), guard.actor, id);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="hamzist-invoice-' + id + '.pdf"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return Response.json(body, { status });
  }
}
