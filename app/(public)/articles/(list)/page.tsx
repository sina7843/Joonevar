import { ContentList, contentListMetadata } from '../../../../src/content/public-views.tsx';

type Search = Promise<{ category?: string | string[]; page?: string | string[] }>;

export function generateMetadata() {
  return contentListMetadata('ARTICLE');
}

export default function ArticlesListPage({ searchParams }: { searchParams: Search }) {
  return <ContentList kind="ARTICLE" searchParams={searchParams} />;
}
