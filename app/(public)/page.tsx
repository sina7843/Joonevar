import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import { Logo } from '../../src/ui/logo.tsx';
import { RecordImage } from '../../src/ui/record-image.tsx';
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
import { COMMUNITY_KIND_FA } from '../../src/communities/model.ts';
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

/** Where a visitor most often wants to go next, once they know what this is. */
const DIRECTORIES: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/veterinarians', label: 'دامپزشکان' },
  { href: '/centers', label: 'مراکز دامپزشکی' },
  { href: '/breeds', label: 'نژادها' },
  { href: '/places', label: 'شهرها' },
  { href: '/associations', label: 'انجمن‌ها' },
];

/**
 * Home — Requirements-Phase-2 §5 (PROMPT-013), recomposed under DEC-0182.
 *
 * The content, the copy, the addresses and the test ids are the ones the
 * product already shipped. What changed is the composition: the page used to be
 * six variations of one layout (a heading over a grid of bordered cards), which
 * flattens everything to the same importance. Now each section carries the shape
 * its content actually has - a split opening, a search band, one wide service
 * beside the rest, a numbered rail, a chip rail, an editorial list, and figures
 * that read as figures rather than as five more cards.
 *
 * A block still disappears entirely when its data does not exist yet, because an
 * empty shelf or a made-up number would claim something the site cannot do.
 */
export default async function HomePage() {
  const actor = await viewer();
  const { origin } = site();
  const [breeds, vets, centres, communities, articles, news] = await Promise.all([
    publishedBreeds(db(), { page: 1, pageSize: 8 }),
    publishedVets(db(), { page: 1, pageSize: 1 }),
    publishedCentres(db(), { page: 1, pageSize: 1 }),
    publishedCommunities(db(), { page: 1, pageSize: 3 }),
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

  const reading = [
    ...articles.items.map((item) => ({ item, path: '/articles/', kind: 'آموزش' })),
    ...news.items.map((item) => ({ item, path: '/news/', kind: 'خبر' })),
  ];

  return (
    <div className="space-y-[56px] md:space-y-[88px]">
      <JsonLdScript data={organizationLd(origin)} />
      <JsonLdScript data={websiteLd(origin)} />

      {/* Opening: the message on one side, the mark on the other. */}
      <section
        aria-labelledby="home-title"
        className="hz-enter overflow-hidden rounded-xl border border-border-subtle bg-bg-brand-subtle"
      >
        <div className="grid items-center gap-xl px-lg py-xl md:grid-cols-[1.2fr_0.8fr] md:px-[56px] md:py-[64px]">
          <div>
            <h1 id="home-title" className="text-display font-bold text-text-primary">
              ثبت رسمی و پیگیری سگ‌ها، در یک‌جا
            </h1>
            <p className="mt-lg max-w-[46ch] text-body-md text-text-secondary">
              هویت حیوان، برگه ثبتی، شجره‌نامه و مسیر جفت‌گیری را با تأیید دامپزشک معتمد و انجمن ثبت و دنبال کنید.
            </p>
            <div className="mt-xl flex flex-wrap gap-sm">
              <ButtonLink href={cta.href}>{cta.label}</ButtonLink>
              <ButtonLink tone="secondary" href="/services">
                خدمات همزیست
              </ButtonLink>
            </div>
          </div>

          {/*
            The official symbol, at the one size on the page where it is the
            image rather than the logo. Hidden on phones so the opening still
            fits the first screen with its call to action.
          */}
          <div
            aria-hidden
            className="hidden justify-self-center rounded-full bg-bg-surface p-[40px] md:block"
          >
            <Logo variant="symbol" height={168} />
          </div>
        </div>
      </section>

      {/* One field, then the five places most visitors are actually heading. */}
      <section aria-labelledby="find-title">
        <h2 id="find-title" className="text-h3">
          دنبال چه می‌گردید؟
        </h2>
        <form
          method="get"
          action="/search"
          role="search"
          className="mt-lg flex flex-wrap items-center gap-sm"
          data-testid="home-search"
        >
          <label htmlFor="home-search-input" className="sr-only">
            جست‌وجوی دامپزشک، مرکز، نژاد یا مطلب
          </label>
          <input
            id="home-search-input"
            name="q"
            type="search"
            placeholder="دنبال دامپزشک، مرکز یا نژاد می‌گردید؟"
            className="min-h-[var(--size-control-md)] w-full min-w-0 flex-1 rounded-full border border-border-subtle bg-bg-surface px-lg text-body-sm text-text-primary focus:border-border-brand sm:w-auto"
            data-testid="home-search-input"
          />
          <button
            type="submit"
            className="hz-lift min-h-[var(--size-control-md)] rounded-full bg-action-primary-default px-xl text-label-md text-action-primary-on"
          >
            جست‌وجو
          </button>
        </form>
        <ul className="mt-lg flex flex-wrap gap-x-xl gap-y-sm">
          {DIRECTORIES.map((entry) => (
            <li key={entry.href}>
              <Link
                href={entry.href}
                className="text-body-sm text-text-brand underline underline-offset-4 hover:opacity-80"
              >
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {breeds.items.length > 0 ? (
        <section aria-labelledby="breeds-title">
          <h2 id="breeds-title" className="text-h3">
            نژادهای سگ
          </h2>
          {/* A rail, because breeds are a list to flick through, not to study. */}
          <ul className="hz-rail mt-lg flex snap-x gap-sm pb-xs" data-testid="home-breeds">
            {breeds.items.map((breed) => (
              <li key={breed.slug} className="shrink-0 snap-start">
                <Link
                  href={'/breeds/' + breed.slug}
                  className="hz-lift inline-flex w-[168px] flex-col gap-sm rounded-lg border border-border-subtle bg-bg-surface p-sm"
                >
                  <RecordImage fileId={breed.imageFileId} altFa={breed.imageAltFa} />
                  <span className="text-label-md whitespace-nowrap">{breed.nameFa}</span>
                  {breed.groupNameFa ? (
                    <span className="text-caption whitespace-nowrap text-text-secondary">{breed.groupNameFa}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reading.length > 0 ? (
        <section aria-labelledby="reading-title">
          <h2 id="reading-title" className="text-h3">
            تازه‌ها
          </h2>
          <ul className="mt-lg grid gap-x-xl md:grid-cols-2" data-testid="home-reading">
            {reading.map(({ item, path, kind }) => (
              <li key={path + item.slug} className="border-t border-border-subtle py-lg">
                <Link href={path + item.slug} className="group flex gap-md">
                  <RecordImage variant="thumb" fileId={item.imageFileId} altFa={item.imageAltFa} />
                  <span className="block min-w-0">
                  <span className="text-caption text-text-secondary">{kind}</span>
                  <span className="mt-2xs block text-label-lg group-hover:text-text-brand">{item.titleFa}</span>
                  <span className="mt-xs block max-w-[60ch] text-body-sm text-text-secondary">{item.summaryFa}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {communities.items.length > 0 ? (
        <section aria-labelledby="communities-title">
          <h2 id="communities-title" className="text-h3">
            انجمن‌ها و کلاب‌ها
          </h2>
          <ul className="mt-lg grid gap-md sm:grid-cols-2 lg:grid-cols-3" data-testid="home-communities">
            {communities.items.map((community) => (
              <li key={community.slug}>
                <Link
                  href={'/associations/' + community.slug}
                  className="hz-lift flex h-full flex-col gap-md rounded-lg border border-border-subtle bg-bg-surface p-lg"
                >
                  <RecordImage fileId={community.imageFileId} altFa={community.imageAltFa} />
                  <span className="block">
                    <span className="block text-label-lg">{community.nameFa}</span>
                    <span className="mt-2xs block text-caption text-text-secondary">
                      {[COMMUNITY_KIND_FA[community.kind], community.placeFa].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.length > 0 ? (
        <section aria-labelledby="stats-title">
          <h2 id="stats-title" className="text-h3">
            همزیست در یک نگاه
          </h2>
          <ul className="mt-xl grid grid-cols-2 gap-lg sm:grid-cols-3 lg:grid-cols-5" data-testid="home-stats">
            {stats.map((stat) => (
              <li key={stat.label}>
                <Link href={stat.href} className="group block">
                  <span className="block text-h1 text-text-brand group-hover:opacity-80">{fa(stat.value)}</span>
                  <span className="mt-2xs block text-caption text-text-secondary">{stat.label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-lg text-caption text-text-secondary">
            این عددها از رکوردهای منتشرشده همین لحظه شمرده می‌شوند.
          </p>
        </section>
      ) : null}

      {/* Services: the first one carries the section, the rest sit beside it. */}
      <section aria-labelledby="services-title">
        <h2 id="services-title" className="text-h3">
          خدمات همزیست
        </h2>
        <ul className="hz-stagger mt-xl grid gap-md md:grid-cols-2 lg:grid-cols-3" data-testid="home-services">
          {SERVICE_CATALOGUE.map((service, index) => {
            const lead = index === 0;
            return (
              <li key={service.slug} className={lead ? 'md:col-span-2 lg:col-span-3' : undefined}>
                <Link
                  href={servicePath(service.slug)}
                  className={
                    'hz-lift flex h-full rounded-lg border p-lg md:p-xl ' +
                    (lead
                      ? 'flex-col border-border-brand bg-bg-brand-subtle md:flex-row md:items-center md:gap-xl'
                      : 'flex-col border-border-subtle bg-bg-surface')
                  }
                  data-testid={'home-service-' + service.slug}
                >
                  <span
                    className={
                      'flex size-[40px] shrink-0 items-center justify-center rounded-md text-text-brand ' +
                      (lead ? 'bg-bg-surface md:size-[56px]' : 'bg-bg-brand-subtle')
                    }
                  >
                    <Icon name="clipboardText" size="md" />
                  </span>
                  <span className={'block min-w-0 ' + (lead ? 'mt-lg md:mt-0' : 'mt-lg')}>
                    <span className={'block ' + (lead ? 'text-h4' : 'text-label-lg')}>{service.titleFa}</span>
                    <span className="mt-xs block max-w-[52ch] text-body-sm text-text-secondary">
                      {service.summaryFa}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* How it works: a rule, a numeral, the step. No box around a sentence. */}
      <section aria-labelledby="steps-title">
        <h2 id="steps-title" className="text-h3">
          روش کار
        </h2>
        <ol className="mt-xl grid gap-xl md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t-2 border-border-brand pt-lg">
              <span className="block text-h3 text-text-brand">{fa(index + 1)}</span>
              <h3 className="mt-sm text-label-lg">{step.title}</h3>
              <p className="mt-xs text-body-sm text-text-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

    </div>
  );
}
