import { ContentDetail, contentDetailMetadata } from '../../../../src/content/public-views.tsx';

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params) {
  return contentDetailMetadata('ANNOUNCEMENT', (await params).slug);
}

// No loading boundary here: a moved address must answer 308 and an unpublished one 404 (DEC-0157).
export default async function AnnouncementsDetailPage({ params }: Params) {
  return <ContentDetail kind="ANNOUNCEMENT" rawSlug={(await params).slug} />;
}
