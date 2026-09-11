import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { db } from '../../../../../../src/db/client.ts';
import { publicCommunityPost } from '../../../../../../src/communities/posts.ts';
import { decodeSlug } from '../../../../../../src/content/public-views.tsx';
import { buildMetadata } from '../../../../../../src/seo/metadata.ts';
import { articleLd } from '../../../../../../src/seo/structured-data.ts';
import { JsonLdScript } from '../../../../../../src/seo/json-ld.tsx';
import { site } from '../../../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../../../src/ui/breadcrumbs.tsx';

type Params = { params: Promise<{ slug: string; postSlug: string }> };

const load = cache((slug: string, postSlug: string) => publicCommunityPost(db(), slug, postSlug));

/** A club post keeps its Persian slug, so the address arrives percent-encoded. */
const loadFrom = async (params: Params['params']) => {
  const { slug, postSlug } = await params;
  const community = decodeSlug(slug);
  const post = decodeSlug(postSlug);
  return community === null || post === null ? null : load(community, post);
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const post = await loadFrom(params);
  if (post === null) return {};
  return buildMetadata(
    { title: post.titleFa, description: post.summaryFa, path: '/associations/' + post.communitySlug + '/posts/' + post.slug },
    site(),
  );
}

/** One club post under its club's address — §11, §19 (PROMPT-010). */
export default async function CommunityPostPage({ params }: Params) {
  const post = await loadFrom(params);
  if (post === null) notFound();

  const { origin } = site();
  const communityPath = '/associations/' + post.communitySlug;
  const path = communityPath + '/posts/' + post.slug;

  return (
    <article className="mx-auto max-w-3xl space-y-xl" data-testid="community-post-page">
      <Breadcrumbs
        items={[
          { name: 'خانه', path: '/' },
          { name: 'انجمن‌ها و کلاب‌ها', path: '/associations' },
          { name: post.communityNameFa, path: communityPath },
          { name: post.titleFa, path },
        ]}
        origin={origin}
      />
      <JsonLdScript
        data={articleLd(
          {
            type: 'Article',
            headline: post.titleFa,
            description: post.summaryFa,
            path,
            datePublished: post.publishedAt ?? post.updatedAt,
            dateModified: post.updatedAt,
            // The club is the author of its own post; Hamzist only publishes it.
            authorName: post.communityNameFa,
            authorIsPerson: false,
            imagePath: null,
          },
          origin,
        )}
      />

      <header className="space-y-sm">
        <h1 className="text-h3 md:text-h1">{post.titleFa}</h1>
        <p className="text-body-md text-text-secondary">{post.summaryFa}</p>
        <p className="text-caption text-text-secondary" data-testid="community-post-author">
          {'نوشته '}
          <Link href={communityPath} className="text-text-brand underline underline-offset-4">
            {post.communityNameFa}
          </Link>
        </p>
      </header>

      <div className="space-y-md text-body-md" data-testid="community-post-body">
        {post.bodyFa.split(/\n{2,}/).map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
    </article>
  );
}
