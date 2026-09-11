import { XML_HEADERS, sitemapSection, urlSetXml } from '../../../src/seo/sitemap.ts';
import { site } from '../../../src/public/request.ts';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await params;
  const match = /^([a-z0-9-]+)\.xml$/.exec(file);
  const section = match ? sitemapSection(match[1]!) : null;
  if (section === null) return new Response('Not found', { status: 404 });
  return new Response(urlSetXml(await section(), site().origin), { headers: XML_HEADERS });
}
