import { NextResponse } from 'next/server';
import { db } from '../../../../../../src/db/client.ts';
import { env } from '../../../../../../src/config/env.ts';
import { currentActor } from '../../../../../../src/authz/request-actor.ts';
import { requireActor } from '../../../../../../src/authz/actor.ts';
import { evidenceFile } from '../../../../../../src/finder/reports.ts';
import { toErrorBody } from '../../../../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/** Report evidence, to the finder report moderators only; every view is audited (PHASE-4 PROMPT-007). */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireActor(await currentActor(db()));
    const { id } = await context.params;
    const { bytes, mime } = await evidenceFile(db(), env().PRIVATE_STORAGE_DIR, actor, id);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': mime,
        'content-length': String(bytes.length),
        'cache-control': 'no-store, private',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'SAMEORIGIN',
        'content-security-policy':
          mime === 'application/pdf' ? "frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
