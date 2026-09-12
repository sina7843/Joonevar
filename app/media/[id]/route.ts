import { NextResponse } from 'next/server';
import { db } from '../../../src/db/client.ts';
import { env } from '../../../src/config/env.ts';
import { publicContentImage } from '../../../src/content/service.ts';
import { publicRecordImage } from '../../../src/media/public-image.ts';

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
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  // One address for every public image: content first, then the directory
  // records. Each source applies its own visibility rule and answers null the
  // same way, so a visitor cannot tell a hidden record from a missing one.
  const storage = env().PRIVATE_STORAGE_DIR;
  const image = (await publicContentImage(db(), storage, id)) ?? (await publicRecordImage(db(), storage, id));
  if (image === null) return new NextResponse('Not found', { status: 404 });

  /*
   * The visibility decision is still made on every request — the ceiling of
   * `must-revalidate` stays, so a hidden or deleted item stops being served at
   * once. What changes for PROMPT-018 is the second view of an image that is
   * still visible: the digest the file already carries answers it with 304, so
   * the bytes cross the wire once instead of on every page view.
   */
  const etag = '"' + image.sha256 + '"';
  const headers = {
    'content-type': image.mime,
    'cache-control': 'public, max-age=0, must-revalidate',
    'content-disposition': 'inline',
    'x-content-type-options': 'nosniff',
    etag,
  };

  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(image.bytes), {
    status: 200,
    headers: { ...headers, 'content-length': String(image.bytes.length) },
  });
}
