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
    <div className="mt-md space-y-md text-body-md">
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="nofollow noopener noreferrer" className="text-text-brand underline underline-offset-4">
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

  return (
    <div className="mx-auto grid max-w-6xl gap-xl lg:grid-cols-[minmax(0,1fr)_320px]">
    <article className="min-w-0 space-y-xl" data-testid="breed-page">
      <Breadcrumbs items={crumbs} origin={origin} />

      {primary ? (
        <Alert tone="info" title="این رکورد تکراری است">
          <span data-testid="breed-duplicate-notice">
            اطلاعات این نژاد در صفحه{' '}
            <Link href={'/breeds/' + primary.slug} className="text-text-brand underline underline-offset-4">
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

      <header>
        <RecordImage priority fileId={breed.imageFileId} altFa={breed.imageAltFa} className="mb-lg" />
        <h1 className="text-h3 md:text-h1">{breed.nameFa}</h1>
        <p className="mt-xs text-body-md text-text-secondary">
          <bdi>{breed.nameEn}</bdi>
        </p>
        {breed.altNames.length > 0 ? (
          <p className="mt-sm text-body-sm text-text-secondary">
            {'نام‌های دیگر: '}
            {breed.altNames.map((name, index) => (
              <Fragment key={name}>
                {index > 0 ? '، ' : ''}
                <bdi>{name}</bdi>
              </Fragment>
            ))}
          </p>
        ) : null}
      </header>

      {facts.length > 0 ? (
        <section aria-labelledby="breed-facts-title">
          <h2 id="breed-facts-title" className="text-h4">
            مشخصات
          </h2>
          <dl className="mt-md grid gap-sm sm:grid-cols-2" data-testid="breed-facts">
            {facts.map((fact) => (
              <div
                key={fact.label}
                className="flex items-center justify-between gap-md rounded-md border border-border-subtle bg-bg-surface px-md py-sm"
              >
                <dt className="text-body-sm text-text-secondary">{fact.label}</dt>
                <dd className="text-label-md text-text-primary">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {breed.historyFa ? (
        <section aria-labelledby="breed-history-title">
          <h2 id="breed-history-title" className="text-h4">
            تاریخچه
          </h2>
          <Prose text={breed.historyFa} />
        </section>
      ) : null}

      {breed.standardFa || breed.standardUrl ? (
        <section aria-labelledby="breed-standard-title">
          <h2 id="breed-standard-title" className="text-h4">
            استاندارد نژاد
          </h2>
          {breed.standardFa ? <Prose text={breed.standardFa} /> : null}
          {breed.standardUrl ? (
            <p className="mt-md text-label-md">
              <ExternalLink href={breed.standardUrl}>متن کامل استاندارد (پیوند بیرونی)</ExternalLink>
            </p>
          ) : null}
        </section>
      ) : null}

      {claimGroups.length > 0 ? (
        <section aria-labelledby="breed-health-title" data-testid="breed-health">
          <h2 id="breed-health-title" className="text-h4">
            سلامت و ژنتیک
          </h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            این مطالب برای آگاهی است و جای معاینه دامپزشک را نمی‌گیرد. آزمایش‌های پیشنهادی از این صفحه ثبت یا سفارش داده
            نمی‌شوند.
          </p>
          {claimGroups.map((entry) => (
            <div key={entry.kind} className="mt-lg">
              <h3 className="text-label-lg">{CLAIM_KIND_FA[entry.kind]}</h3>
              <ul className="mt-sm space-y-sm">
                {entry.items.map((claim) => (
                  <li
                    key={claim.id}
                    className="rounded-lg border border-border-subtle bg-bg-surface p-md"
                    data-testid="breed-claim"
                  >
                    <p className="text-label-md">{claim.titleFa}</p>
                    {claim.noteFa ? <p className="mt-xs text-body-sm">{claim.noteFa}</p> : null}
                    <p className="mt-sm text-caption text-text-secondary">
                      {'منبع: '}
                      {claim.sourceUrl ? (
                        <ExternalLink href={claim.sourceUrl}>{claim.sourceTitle}</ExternalLink>
                      ) : (
                        claim.sourceTitle
                      )}
                      {' · بازبینی: '}
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

      <RelatedColumn
        groups={[
          {
            // Only the second title claims a connection to this breed.
            titleFa: related.length > 0 ? 'مطالب مرتبط' : 'خواندنی‌ها',
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
          },
          { titleFa: 'نژادهای دیگر', items: otherBreeds },
          { titleFa: 'مراکز دامپزشکی', items: centres },
        ]}
      />
    </div>
  );
}
