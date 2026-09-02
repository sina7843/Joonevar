import { NextResponse } from 'next/server';
import { db } from '../../../../src/db/client.ts';
import { env } from '../../../../src/config/env.ts';
import { currentActor } from '../../../../src/authz/session.ts';
import { requireActor } from '../../../../src/authz/actor.ts';
import { readPrivateFile } from '../../../../src/files/storage.ts';
import { toErrorBody } from '../../../../src/domain/errors.ts';

export const dynamic = 'force-dynamic';

/**
 * The only way to read a private file. Authorization runs before any filesystem
 * access, so an unauthorized caller cannot even learn whether the object exists.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = requireActor(await currentActor(request));
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
      },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
