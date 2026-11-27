import type { Metadata } from 'next';
import { RecordImage } from '../../../../src/ui/record-image.tsx';
import { RelatedColumn } from '../../../../src/public/related-column.tsx';
import { relatedContent, similarBreeds, similarCentres } from '../../../../src/public/related.ts';
import Link from 'next/link';
import { Fragment, cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { db } from '../../../../src/db/client.ts';
import { breedPageBySlug, type BreedPage } from '../../../../src/breeds/service.ts';
import { relatedContentForBreed } from '../../../../src/content/service.ts';
import { KIND_FA, KIND_PATH } from '../../../../src/content/model.ts';
import {
  BREED_CLAIM_KINDS,
  CLAIM_KIND_FA,
  COAT_FA,
  LEVEL_ATTRIBUTES,
  LEVEL_FA,
  SIZE_FA,
  countryNameFa,
} from '../../../../src/breeds/model.ts';
import { formatCivilDateFa } from '../../../../src/domain/calendar.ts';
import { buildMetadata } from '../../../../src/seo/metadata.ts';
import { site } from '../../../../src/public/request.ts';
import { Breadcrumbs } from '../../../../src/ui/breadcrumbs.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { PageHeader, SectionHeader } from '../../../../src/ui/section-header.tsx';
import { CtaBand } from '../../public-ui.tsx';
import { BreedTraits } from '../../../../src/public/breed-traits.tsx';

type Params = { params: Promise<{ slug: string }> };

// Metadata and the page ask for the same record in one request.
const load = cache((slug: string) => breedPageBySlug(db(), slug));

const fa = (value: number): string => value.toLocaleString('fa-IR');

function summary(page: Extract<BreedPage, { kind: 'breed' }>): string {
  const text = (page.breed.historyFa ?? page.breed.standardFa ?? '').replace(/\s+/g, ' ').trim();
  if (text === '') return 'مشخصات نژاد ' + page.breed.nameFa + ' در بانک نژاد همزیست.';
  return text.length > 155 ? text.slice(0, 154) + '…' : text;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const page = await load((await params).slug);
  if (page === null || page.kind === 'redirect') return {};
  const { breed, primary } = page;
  return buildMetadata(
    {
      title: breed.nameFa + ' (' + breed.nameEn + ')',
      description: summary(page),
      path: '/breeds/' + breed.slug,
      // A real picture in the share card, when the record carries one.
      image: breed.imageFileId ? { path: '/media/' + breed.imageFileId, alt: breed.imageAltFa ?? breed.nameFa } : undefined,
      state: primary ? 'DUPLICATE' : breed.profileStatus === 'ARCHIVED' ? 'ARCHIVED' : 'PUBLISHED',
      primaryPath: primary ? '/breeds/' + primary.slug : undefined,
      type: 'article',
    },
    site(),
  );
}

function Prose({ text }: { text: string }) {
  return (
    <div className="hz-prose">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="nofollow noopener noreferrer" className="hz-link">
      {children}
    </a>
  );
}

/** One breed — Requirements-Phase-2 §6 (PROMPT-003). */
export default async function BreedPageView({ params }: Params) {
  const page = await load((await params).slug);
  if (page === null) notFound();
  // An address the breed used to have answers with the one it has now (§23).
  if (page.kind === 'redirect') permanentRedirect('/breeds/' + page.slug);

  const { breed, group, claims, primary } = page;
  const { origin } = site();
  const crumbs = [
    { name: 'خانه', path: '/' },
    { name: 'نژادهای سگ', path: '/breeds' },
    { name: breed.nameFa, path: '/breeds/' + breed.slug },
  ];
  const country = breed.originCountry ? countryNameFa(breed.originCountry) : null;
  const facts = [
    group ? { label: 'گروه FCI', value: 'گروه ' + fa(group.fciGroup) + ' — ' + group.nameFa } : null,
    country ? { label: 'کشور مبدأ', value: country } : null,
    breed.size ? { label: 'اندازه', value: SIZE_FA[breed.size] } : null,
    breed.coat ? { label: 'پوشش', value: COAT_FA[breed.coat] } : null,
    ...LEVEL_ATTRIBUTES.map(({ key, labelFa }) => {
      const level = breed[key];
      return level ? { label: labelFa, value: LEVEL_FA[level] } : null;
    }),
  ].filter((fact): fact is { label: string; value: string } => fact !== null);
  const claimGroups = BREED_CLAIM_KINDS.map((kind) => ({ kind, items: claims.filter((c) => c.kind === kind) })).filter(
    (entry) => entry.items.length > 0,
  );
  // Education and news written about this breed (PROMPT-004: content relations).
  const related = await relatedContentForBreed(db(), breed.id);
  const [otherBreeds, centres, latestReading] = await Promise.all([
    similarBreeds(db(), { excludeSlug: breed.slug, limit: 4 }),
    similarCentres(db(), { limit: 3 }),
    // Nothing written about this breed yet is not the same as nothing to read.
    relatedContent(db(), { limit: 3 }),
  ]);

  const basics = facts.filter((fact) => !LEVEL_ATTRIBUTES.some((attribute) => attribute.labelFa === fact.label));

  return (
    <div className="space-y-xl">
      <div className="space-y-md">
        <Breadcrumbs items={crumbs} origin={origin} />
        <PageHeader
          title={breed.nameFa}
          meta={[
            <bdi key="en" dir="ltr">
              {breed.nameEn}
            </bdi>,
            ...(group ? ['گروه FCI ' + fa(group.fciGroup)] : []),
            ...(breed.size ? [SIZE_FA[breed.size]] : []),
          ]}
        />
      </div>

      <div className="grid gap-xl lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <article className="min-w-0 space-y-xl" data-testid="breed-page">
          {primary ? (
            <Alert tone="info" title="این رکورد تکراری است">
              <span data-testid="breed-duplicate-notice">
                اطلاعات این نژاد در صفحه{' '}
                <Link href={'/breeds/' + primary.slug} className="hz-link">
                  {primary.nameFa}
                </Link>{' '}
                نگهداری می‌شود.
              </span>
            </Alert>
          ) : breed.profileStatus === 'ARCHIVED' ? (
            <Alert tone="warning" title="این صفحه بایگانی شده است">
              <span data-testid="breed-archived-notice">مطالب این صفحه دیگر به‌روز نمی‌شود و ممکن است قدیمی باشد.</span>
            </Alert>
          ) : null}

          <RecordImage priority variant="banner" fileId={breed.imageFileId} altFa={breed.imageAltFa} className="rounded-xl" />

          {breed.altNames.length > 0 ? (
            <p className="hz-body-sm text-text-secondary">
              {'نام‌های دیگر: '}
              {breed.altNames.map((name, index) => (
                <Fragment key={name}>
                  {index > 0 ? '، ' : ''}
                  <bdi>{name}</bdi>
                </Fragment>
              ))}
            </p>
          ) : null}

          {facts.length > 0 ? (
            <section aria-labelledby="breed-facts-title" className="hz-card">
              <SectionHeader size="sm" id="breed-facts-title" title="مشخصات" />
              <div className="hz-breed-profile" data-testid="breed-facts">
                <dl className="hz-kv">
                  {basics.map((fact) => (
                    <div key={fact.label} className="hz-kv__row">
                      <dt className="hz-kv__key">{fact.label}</dt>
                      <dd className="hz-kv__value">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
                <BreedTraits breed={breed} />
              </div>
            </section>
          ) : null}

          {breed.historyFa ? (
            <section aria-labelledby="breed-history-title" className="hz-card">
              <SectionHeader size="sm" id="breed-history-title" title="تاریخچه" />
              <Prose text={breed.historyFa} />
            </section>
          ) : null}

          {breed.standardFa || breed.standardUrl ? (
            <section aria-labelledby="breed-standard-title" className="hz-card">
              <SectionHeader size="sm" id="breed-standard-title" title="استاندارد نژاد" />
              {breed.standardFa ? <Prose text={breed.standardFa} /> : null}
              {breed.standardUrl ? (
                <p className="mt-md hz-body-sm">
                  <ExternalLink href={breed.standardUrl}>متن کامل استاندارد (پیوند بیرونی)</ExternalLink>
                </p>
              ) : null}
            </section>
          ) : null}

          {claimGroups.length > 0 ? (
            <section aria-labelledby="breed-health-title" className="hz-card" data-testid="breed-health">
              <SectionHeader size="sm" id="breed-health-title" title="سلامت و ژنتیک" />
              <p className="hz-caption">
                این مطالب برای آگاهی است و جای معاینه دامپزشک را نمی‌گیرد. آزمایش‌های پیشنهادی از این صفحه ثبت یا سفارش داده
                نمی‌شوند.
              </p>
              {claimGroups.map((entry) => (
                <div key={entry.kind} className="mt-lg">
                  <h3 className="hz-card__title">{CLAIM_KIND_FA[entry.kind]}</h3>
                  <ul className="mt-sm divide-y divide-border-subtle">
                    {entry.items.map((claim) => (
                      <li key={claim.id} className="py-md" data-testid="breed-claim">
                        <p className="text-label-lg">{claim.titleFa}</p>
                        {claim.noteFa ? <p className="mt-xs hz-body-sm">{claim.noteFa}</p> : null}
                        <p className="mt-xs hz-caption">
                          {'منبع: '}
                          {claim.sourceUrl ? <ExternalLink href={claim.sourceUrl}>{claim.sourceTitle}</ExternalLink> : claim.sourceTitle}
                          {'، بازبینی: '}
                          <span data-testid="breed-claim-reviewed">{formatCivilDateFa(claim.reviewedOn)}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ) : null}
        </article>

        <div className="hz-reading__aside min-w-0">
          <RelatedColumn
            groups={[
              {
                // Only the second title claims a connection to this breed.
                titleFa: related.length > 0 ? 'مطالب مرتبط' : 'خواندنی‌ها',
                noteAsTag: true,
                items:
                  related.length > 0
                    ? related.map((entry) => ({
                        href: (KIND_PATH[entry.kind] ?? '') + '/' + entry.slug,
                        titleFa: entry.titleFa,
                        noteFa: KIND_FA[entry.kind] ?? null,
                        imageFileId: entry.imageFileId,
                        imageAltFa: entry.imageAltFa,
                      }))
                    : latestReading,
                link: { href: '/articles', label: 'همه آموزش‌ها' },
              },
              { titleFa: 'نژادهای دیگر', items: otherBreeds, link: { href: '/breeds', label: 'همه نژادها' } },
              { titleFa: 'مراکز دامپزشکی', items: centres, link: { href: '/centers', label: 'همه مراکز' } },
            ]}
          />
        </div>
      </div>

      <CtaBand id="breed-cta-title" />
    </div>
  );
}
