import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import { JsonLdScript } from '../../src/seo/json-ld.tsx';
import { buildMetadata } from '../../src/seo/metadata.ts';
import { organizationLd, websiteLd } from '../../src/seo/structured-data.ts';
import { site, viewer } from '../../src/public/request.ts';
import { db } from '../../src/db/client.ts';
import { SERVICE_CATALOGUE, servicePath } from '../../src/services/catalogue.ts';
import { publishedBreeds } from '../../src/breeds/service.ts';
import { publishedVets } from '../../src/vets/directory.ts';
import { publishedCentres } from '../../src/centres/service.ts';
import { publishedCommunities } from '../../src/communities/service.ts';
import { publicContentList } from '../../src/content/service.ts';

export const dynamic = 'force-dynamic';

const TITLE = 'همزیست — ثبت و پیگیری رسمی سگ‌ها';
const DESCRIPTION =
  'ثبت هویت، میکروچیپ و برگه ثبتی، شجره‌نامه، کنل و مجوز جفت‌گیری سگ‌ها در یک سامانه فارسی، با تأیید دامپزشک معتمد و انجمن.';

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/' }, site());
}

const fa = (value: number): string => value.toLocaleString('fa-IR');

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'ورود با شماره موبایل', body: 'با کد یک‌بارمصرف وارد می‌شوید؛ حساب تازه همان‌جا ساخته می‌شود.' },
  { title: 'تکمیل و احراز هویت', body: 'اطلاعات هویتی و تصویر کارت ملی را برای بررسی می‌فرستید.' },
  { title: 'ثبت حیوان و درخواست خدمت', body: 'از پنل خود حیوان را ثبت می‌کنید و هر خدمت را قدم‌به‌قدم پیگیری می‌کنید.' },
];

/**
 * Home — Requirements-Phase-2 §5 (PROMPT-013).
 *
 * Value message, the services with their own pages, how it works, a way into
 * the directories, featured breeds, the latest article and news, a published
 * association or club, and figures that are counted from real published records
 * — a block disappears entirely when its data does not exist yet, because an
 * empty shelf or a made-up number would claim something the site cannot do.
 */
export default async function HomePage() {
  const actor = await viewer();
  const { origin } = site();
  const [breeds, vets, centres, communities, articles, news] = await Promise.all([
    publishedBreeds(db(), { page: 1, pageSize: 4 }),
    publishedVets(db(), { page: 1, pageSize: 1 }),
    publishedCentres(db(), { page: 1, pageSize: 1 }),
    publishedCommunities(db(), { page: 1, pageSize: 2 }),
    publicContentList(db(), { kind: 'ARTICLE', page: 1, pageSize: 2 }),
    publicContentList(db(), { kind: 'NEWS', page: 1, pageSize: 2 }),
  ]);

  const cta =
    actor === null ? { href: '/login', label: 'ورود / ثبت‌نام' } : { href: '/dashboard', label: 'رفتن به پنل من' };

  // §5: figures only where they are counted from real published records.
  const stats: ReadonlyArray<{ label: string; value: number; href: string }> = [
    { label: 'دامپزشک منتشرشده', value: vets.publishedTotal, href: '/veterinarians' },
    { label: 'مرکز دامپزشکی', value: centres.publishedTotal, href: '/centers' },
    { label: 'نژاد سگ', value: breeds.publishedTotal, href: '/breeds' },
    { label: 'انجمن و کلاب', value: communities.publishedTotal, href: '/associations' },
    { label: 'آموزش', value: articles.visibleTotal, href: '/articles' },
  ].filter((row) => row.value > 0);

  return (
    <div className="space-y-xl">
      <JsonLdScript data={organizationLd(origin)} />
      <JsonLdScript data={websiteLd(origin)} />

      <section aria-labelledby="home-title" className="rounded-lg bg-bg-brand-subtle px-lg py-xl md:px-xl">
        <h1 id="home-title" className="text-h3 text-text-primary md:text-h1">
          ثبت رسمی و پیگیری سگ‌ها، در یک‌جا
        </h1>
        <p className="mt-md max-w-2xl text-body-md text-text-secondary">
          هویت حیوان، برگه ثبتی، شجره‌نامه و مسیر جفت‌گیری را با تأیید دامپزشک معتمد و انجمن ثبت و دنبال کنید.
        </p>
        <div className="mt-xl flex flex-wrap gap-sm">
          <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
          <ButtonLink tone="secondary" href="/services">
            خدمات همزیست
          </ButtonLink>
        </div>

        <form method="get" action="/search" role="search" className="mt-xl flex flex-wrap gap-sm" data-testid="home-search">
          <label htmlFor="home-search-input" className="sr-only">
            جست‌وجوی دامپزشک، مرکز، نژاد یا مطلب
          </label>
          <input
            id="home-search-input"
            name="q"
            type="search"
            placeholder="دنبال دامپزشک، مرکز یا نژاد می‌گردید؟"
            className="min-h-[var(--size-control-md)] w-full max-w-md rounded-md border border-border-subtle bg-bg-surface px-md text-body-sm text-text-primary focus:border-border-brand"
            data-testid="home-search-input"
          />
          <ButtonLink tone="secondary" href="/veterinarians">
            فهرست دامپزشکان
          </ButtonLink>
          <ButtonLink tone="secondary" href="/centers">
            فهرست مراکز
          </ButtonLink>
        </form>
      </section>

      <section aria-labelledby="services-title">
        <h2 id="services-title" className="text-h4">
          خدمات همزیست
        </h2>
        <ul className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-4" data-testid="home-services">
          {SERVICE_CATALOGUE.map((service) => (
            <li key={service.slug}>
              <Link
                href={servicePath(service.slug)}
                className="flex h-full flex-col rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                data-testid={'home-service-' + service.slug}
              >
                <span className="flex size-[40px] items-center justify-center rounded-md bg-bg-brand-subtle text-text-brand">
                  <Icon name="clipboardText" size="md" />
                </span>
                <span className="mt-md text-label-lg">{service.titleFa}</span>
                <span className="mt-xs text-body-sm text-text-secondary">{service.summaryFa}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-h4">
          روش کار
        </h2>
        <ol className="mt-lg grid gap-md md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg">
              <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-action-primary-default text-label-md text-action-primary-on">
                {fa(index + 1)}
              </span>
              <div>
                <h3 className="text-label-lg">{step.title}</h3>
                <p className="mt-xs text-body-sm text-text-secondary">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {breeds.items.length > 0 ? (
        <section aria-labelledby="breeds-title">
          <h2 id="breeds-title" className="text-h4">
            نژادهای سگ
          </h2>
          <ul className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-4" data-testid="home-breeds">
            {breeds.items.map((breed) => (
              <li key={breed.slug}>
                <Link
                  href={'/breeds/' + breed.slug}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                >
                  <span className="block text-label-lg">{breed.nameFa}</span>
                  {breed.groupNameFa ? <span className="mt-2xs block text-caption text-text-secondary">{breed.groupNameFa}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {articles.items.length > 0 || news.items.length > 0 ? (
        <section aria-labelledby="reading-title">
          <h2 id="reading-title" className="text-h4">
            تازه‌ها
          </h2>
          <ul className="mt-lg grid gap-md sm:grid-cols-2" data-testid="home-reading">
            {[...articles.items.map((item) => ({ item, path: '/articles/' })), ...news.items.map((item) => ({ item, path: '/news/' }))].map(
              ({ item, path }) => (
                <li key={path + item.slug}>
                  <Link
                    href={path + item.slug}
                    className="block h-full rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                  >
                    <span className="block text-label-lg">{item.titleFa}</span>
                    <span className="mt-xs block text-body-sm text-text-secondary">{item.summaryFa}</span>
                  </Link>
                </li>
              ),
            )}
          </ul>
        </section>
      ) : null}

      {communities.items.length > 0 ? (
        <section aria-labelledby="communities-title">
          <h2 id="communities-title" className="text-h4">
            انجمن‌ها و کلاب‌ها
          </h2>
          <ul className="mt-lg grid gap-md sm:grid-cols-2" data-testid="home-communities">
            {communities.items.map((community) => (
              <li key={community.slug}>
                <Link
                  href={'/associations/' + community.slug}
                  className="block rounded-lg border border-border-subtle bg-bg-surface p-lg transition-colors hover:border-border-brand"
                >
                  <span className="block text-label-lg">{community.nameFa}</span>
                  {community.placeFa ? <span className="mt-2xs block text-caption text-text-secondary">{community.placeFa}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.length > 0 ? (
        <section aria-labelledby="stats-title">
          <h2 id="stats-title" className="text-h4">
            همزیست در یک نگاه
          </h2>
          <ul className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-5" data-testid="home-stats">
            {stats.map((stat) => (
              <li key={stat.label} className="rounded-lg border border-border-subtle bg-bg-surface p-lg text-center">
                <Link href={stat.href}>
                  <span className="block text-h4 text-text-brand">{fa(stat.value)}</span>
                  <span className="mt-xs block text-caption text-text-secondary">{stat.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-sm text-caption text-text-secondary">
            این عددها از رکوردهای منتشرشده همین لحظه شمرده می‌شوند.
          </p>
        </section>
      ) : null}
    </div>
  );
}
