import { NextResponse } from 'next/server';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { currentActor } from '../../../../src/authz/request-actor.ts';
import { requireActor } from '../../../../src/authz/actor.ts';
import { readPrivateFile } from '../../../../src/files/storage.ts';
import { toErrorBody } from '../../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * The only way to read a private file. Authorization runs before any filesystem
 * access, so an unauthorized caller cannot even learn whether the object exists.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireActor(await currentActor(db()));
    const { id } = await context.params;
    const { record, bytes } = await readPrivateFile(db(), env().PRIVATE_STORAGE_DIR, actor, id);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': record.mime,
        'content-length': String(record.sizeBytes),
        // Private identity material must never be cached by a proxy or the browser.
        'cache-control': 'no-store, private',
        'content-disposition': 'inline',
        'x-content-type-options': 'nosniff',
        // Safe preview (PHASE-2.5 PROMPT-007): only this site may frame a private file, and an image
        // is rendered as a sandboxed document that can run nothing. A PDF keeps the browser's own
        // viewer, which a sandbox would disable.
        'x-frame-options': 'SAMEORIGIN',
        'content-security-policy':
          record.mime === 'application/pdf'
            ? "frame-ancestors 'self'"
            : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; frame-ancestors 'self'; sandbox",
      },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
