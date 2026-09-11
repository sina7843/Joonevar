import { ContentDetail, contentDetailMetadata } from '../../../../src/content/public-views.tsx';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return contentDetailMetadata('NEWS', (await params).slug);
}

// No loading boundary here: a moved address must answer 308 and an unpublished one 404 (DEC-0157).
export default async function NewsDetailPage({ params }: Params) {
  return <ContentDetail kind="NEWS" rawSlug={(await params).slug} />;
}
