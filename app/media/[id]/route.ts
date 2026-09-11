import { NextResponse } from 'next/server';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { publicContentImage } from '../../../src/content/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Public content images (DEC-0160).
 *
 * The file itself stays in private storage. It is served only while some
 * visible or archived content shows it, so hiding, unpublishing or deleting the
 * content takes the image down too; every other id answers the same 404.
 * Revalidated on every request rather than cached, so a moderation decision is
 * not outlived by a cached copy.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const image = await publicContentImage(db(), env().PRIVATE_STORAGE_DIR, id);
  if (image === null) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      'content-type': image.mime,
      'content-length': String(image.bytes.length),
      'cache-control': 'public, max-age=0, must-revalidate',
      'content-disposition': 'inline',
      'x-content-type-options': 'nosniff',
    },
  });
}
