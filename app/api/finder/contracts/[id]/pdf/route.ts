import { NextResponse } from 'next/server';
import { db } from '../../../../../../src/db/client.ts';
import { env } from '../../../../../../src/config/env.ts';
import { currentActor } from '../../../../../../src/authz/request-actor.ts';
import { requireActor } from '../../../../../../src/authz/actor.ts';
import { contractPdfFor } from '../../../../../../src/finder/contracts.ts';
import { toErrorBody } from '../../../../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * The confirmed contract's stored PDF, for its two parties only (PHASE-4
 * PROMPT-005). The party check runs before any file is touched; every
 * download is audited.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireActor(await currentActor(db()));
    const { id } = await context.params;
    const bytes = await contractPdfFor(db(), env().PRIVATE_STORAGE_DIR, actor, id);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(bytes.length),
        'cache-control': 'no-store, private',
        'content-disposition': 'attachment; filename="hamzist-mating-contract.pdf"',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
