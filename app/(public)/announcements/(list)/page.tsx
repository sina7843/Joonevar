import { ContentList, contentListMetadata } from '../../../../src/content/public-views.tsx';

type Search = Promise<{ category?: string | string[]; page?: string | string[] }>;

export function generateMetadata() {
  return contentListMetadata('ANNOUNCEMENT');
}

export default function AnnouncementsListPage({ searchParams }: { searchParams: Search }) {
  return <ContentList kind="ANNOUNCEMENT" searchParams={searchParams} />;
}
