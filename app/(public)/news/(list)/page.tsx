import { ContentList, contentListMetadata } from '../../../../src/content/public-views.tsx';

type Search = Promise<{ category?: string | string[]; page?: string | string[] }>;

export function generateMetadata() {
  return contentListMetadata('NEWS');
}

export default function NewsListPage({ searchParams }: { searchParams: Search }) {
  return <ContentList kind="NEWS" searchParams={searchParams} />;
}
