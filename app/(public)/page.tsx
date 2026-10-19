import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type CSSProperties, type ReactNode } from 'react';
import { and, asc, count, eq, isNotNull, isNull } from 'drizzle-orm';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import type { IconName } from '../../src/ui/icon-paths.ts';
import { RecordImage } from '../../src/ui/record-image.tsx';
import { SectionHeader } from '../../src/ui/section-header.tsx';
import { NetworkErrorState } from '../../src/ui/states.tsx';
import { HeroCarousel } from '../../src/public/hero-carousel.tsx';
import { BreedTraits } from '../../src/public/breed-traits.tsx';
import { CentreCard, VetCard } from '../../src/public/directory-cards.tsx';
import { JsonLdScript } from '../../src/seo/json-ld.tsx';
import { buildMetadata } from '../../src/seo/metadata.ts';
import { organizationLd, websiteLd } from '../../src/seo/structured-data.ts';
import { site } from '../../src/public/request.ts';
import { db } from '../../src/db/client.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { readSetting } from '../../src/settings/service.ts';
import { SERVICE_CATALOGUE, servicePath } from '../../src/services/catalogue.ts';
import { publishedBreeds } from '../../src/breeds/service.ts';
import { SIZE_FA } from '../../src/breeds/model.ts';
import { publishedVets } from '../../src/vets/directory.ts';
import { publishedCentres } from '../../src/centres/service.ts';
import { publishedCommunities } from '../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA } from '../../src/communities/model.ts';
import { publicContentList, type ContentCard } from '../../src/content/service.ts';
import { publicListings } from '../../src/marketplace/public-listings.ts';
import { EMPTY_FILTER } from '../../src/marketplace/discovery-model.ts';
import { parseShopFilter, shopPage } from '../../src/commerce/shop-discovery.ts';
import { formatCivilDateFa } from '../../src/domain/calendar.ts';
import { ListingCard } from './animals-market/listing-card.tsx';
import { ProductCard } from './shop/product-card.tsx';
import { CtaBand } from './public-ui.tsx';

export const dynamic = 'force-dynamic';

const TITLE = 'همزیست — ثبت و پیگیری رسمی سگ‌ها';
const DESCRIPTION =
  'ثبت هویت، میکروچیپ و برگه ثبتی، شجره‌نامه، کنل و مجوز جفت‌گیری سگ‌ها در یک سامانه فارسی، با تأیید دامپزشک معتمد و انجمن.';

export function generateMetadata(): Metadata {
  return buildMetadata({ title: TITLE, description: DESCRIPTION, path: '/' }, site());
}

const fa = (value: number): string => value.toLocaleString('fa-IR');
const dateFa = (date: Date): string =>
  new Intl.DateTimeFormat('fa-IR-u-ca-persian', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
const row = (cols: number, colsMd: number, item: string): CSSProperties =>
  ({ '--cols': cols, '--cols-md': colsMd, '--row-item': item }) as CSSProperties;

/** P01 «دنبال چه می‌گردید؟»: the five quick entries, approved copy (K1). */
const QUICK: ReadonlyArray<{ href: string; label: string; descFa: string }> = [
  { href: '/veterinarians', label: 'دامپزشکان', descFa: 'دامپزشک معتمد نزدیک شما' },
  { href: '/centers', label: 'مراکز دامپزشکی', descFa: 'کلینیک، بیمارستان و آزمایشگاه' },
  { href: '/breeds', label: 'نژادهای سگ', descFa: 'ویژگی‌ها، نگهداری و تاریخچه' },
  { href: '/animals-market', label: 'بازار فروش حیوان', descFa: 'آگهی‌های بررسی‌شده با شناسه ثبت' },
  { href: '/shop', label: 'فروشگاه کالا', descFa: 'غذا، لوازم و بهداشت' },
];

/** Brand imagery of the home hero (images-manifest `home/*`), approved alt text. */
const HERO_SLIDES = [
  { src: '/brand/imagery/sample-hero-dog.jpg', altFa: 'زنی با گربه و سگ ژرمن شپرد روی مبل خانه' },
  { src: '/brand/imagery/home-hero-sarabi-courtyard.jpg', altFa: 'مردی کنار سگ سرابی‌اش در حیاط باغ ایرانی' },
  { src: '/brand/imagery/home-hero-cat-owner.jpg', altFa: 'زنی با گربه خاکستری‌اش کنار پنجره آفتابی خانه' },
] as const;

/** P01 row 9: the three steps of «روش کار», approved copy and photos (K1). */
const STEPS: ReadonlyArray<{ title: string; body: string; src: string }> = [
  { title: 'ثبت حیوان', body: 'اطلاعات حیوان را در شش مرحله وارد کنید؛ هر مرحله ذخیره می‌شود.', src: '/brand/imagery/home-step-register.jpg' },
  { title: 'مراجعه به دامپزشک معتمد', body: 'هویت حیوان تأیید، میکروچیپ ثبت و نمونه خون گرفته می‌شود.', src: '/brand/imagery/home-step-vet.jpg' },
  { title: 'دریافت سند رسمی', body: 'پس از بررسی انجمن، برگه ثبتی صادر می‌شود و قابل استعلام است.', src: '/brand/imagery/home-step-document.jpg' },
];

/** P01 row 11 fallback photo (images-manifest `content/article-5461`). */
const CTA_FALLBACK = { src: '/brand/imagery/home-cta-garden.jpg', altFa: 'دو سگ هم‌نژاد در باغ' };

/** A home setting that may not exist yet in an older database reads as unset. */
async function homeSetting(key: string): Promise<string | null> {
  try {
    const record = await readSetting(db(), key);
    return typeof record.value === 'string' && record.value.trim() !== '' ? record.value.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Home — Requirements-Phase-2 §5, drawn as DS pattern P01 / key screen K1
 * (v1.0.4, DEC-0231): a column of rounded frames, white and cream alternating,
 * the Hero peach. Every section loads on its own: a slow one shows its skeleton,
 * a failed one collapses to a compact error in its own slot, and an empty one
 * disappears with its frame — never a made-up number or «مطلبی نیست».
 */
export default function HomePage() {
  const { origin } = site();
  return (
    <div className="hz-home-stack">
      <JsonLdScript data={organizationLd(origin)} />
      <JsonLdScript data={websiteLd(origin)} />
      <Suspense fallback={<FrameSkeleton title="تازه‌ها" cols={2} />}>
        <ReadingSection />
      </Suspense>
      <Hero />
      <QuickSection />
      <Suspense fallback={<FrameSkeleton title="نژادهای سگ" cols={5} />}>
        <BreedsSection />
      </Suspense>
      <Suspense fallback={<FrameSkeleton title="بازار همزیست" cols={4} cream />}>
        <MarketSection />
      </Suspense>
      <Suspense fallback={<FrameSkeleton title="دامپزشکان و مراکز معتمد" cols={4} />}>
        <DirectorySection />
      </Suspense>
      <Suspense fallback={<FrameSkeleton title="انجمن‌ها و کلاب‌ها" cols={4} cream />}>
        <CommunitiesSection />
      </Suspense>
      <Suspense fallback={<FrameSkeleton title="همزیست در یک نگاه" cols={4} />}>
        <GlanceSection />
      </Suspense>
      <ServicesSection />
      <Suspense fallback={null}>
        <CtaSection />
      </Suspense>
    </div>
  );
}

// ── Frames and states ─────────────────────────────────────────────────────

function Frame({ id, title, link, cream, testId, children }: {
  id: string;
  title: string;
  link?: { href: string; label?: ReactNode };
  cream?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section className={cream ? 'hz-frame hz-frame--cream' : 'hz-frame'} aria-labelledby={id} data-testid={testId}>
      <SectionHeader id={id} title={title} link={link} />
      {children}
    </section>
  );
}

function FrameSkeleton({ title, cols, cream }: { title: string; cols: number; cream?: boolean }) {
  return (
    <section className={cream ? 'hz-frame hz-frame--cream' : 'hz-frame'} aria-label={title}>
      <SectionHeader title={title} />
      <ul className="hz-row" style={row(cols, Math.min(cols, 3), '72%')} role="status" aria-busy="true" aria-label="در حال بارگذاری">
        {Array.from({ length: cols }).map((_, index) => (
          <li key={index} className="flex-col gap-sm">
            <span className="hz-skeleton hz-skeleton--media" />
            <span className="hz-skeleton hz-skeleton--title" />
            <span className="hz-skeleton hz-skeleton--text" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A section whose data failed: the compact network error inside its own frame. */
function FrameError({ id, title, cream }: { id: string; title: string; cream?: boolean }) {
  return (
    <Frame id={id} title={title} cream={cream}>
      <NetworkErrorState retryHref="/" compact />
    </Frame>
  );
}

async function attempt<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (error) {
    console.error('home section failed', error);
    return null;
  }
}

// ── 1 · «تازه‌ها» ──────────────────────────────────────────────────────────

const ReadTimeMeta = ({ card }: { card: ContentCard }) => (
  <span className="hz-meta__item">
    <Icon name="clock" size="xs" />
    {fa(card.readMinutes) + ' دقیقه مطالعه'}
  </span>
);

async function ReadingSection() {
  const data = await attempt(() =>
    Promise.all([
      publicContentList(db(), { kind: 'ARTICLE', page: 1, pageSize: 2 }),
      publicContentList(db(), { kind: 'NEWS', page: 1, pageSize: 3 }),
      publicContentList(db(), { kind: 'ANNOUNCEMENT', page: 1, pageSize: 1 }),
    ]),
  );
  if (data === null) return <FrameError id="reading-title" title="تازه‌ها" />;
  const [articles, news, announcements] = data;
  const lead = articles.items[0] ?? null;
  const rest = [
    ...articles.items.slice(1).map((item) => ({ item, path: '/articles/', kind: 'آموزش' })),
    ...news.items.map((item) => ({ item, path: '/news/', kind: 'خبر' })),
    ...announcements.items.map((item) => ({ item, path: '/announcements/', kind: 'اطلاعیه' })),
  ]
    .sort((a, b) => b.item.publishAt.getTime() - a.item.publishAt.getTime())
    .slice(0, 4);
  if (!lead && rest.length === 0) return null;

  return (
    <Frame
      id="reading-title"
      title="تازه‌ها"
      link={{
        href: '/articles',
        label: (
          <>
            <span className="hz-show-md">همه مطالب مجله</span>
            <span className="hz-hide-md">مجله</span>
          </>
        ),
      }}
    >
      <div className="flex flex-col gap-sm lg:grid lg:grid-cols-12 lg:items-start lg:gap-lg" data-testid="home-reading">
        {lead ? (
          <div className="lg:col-span-7">
            <Link className="hz-article hz-article--feature" href={'/articles/' + lead.slug} title={lead.titleFa}>
              <RecordImage variant="banner" fileId={lead.imageFileId} altFa={lead.imageAltFa} priority>
                <span className="hz-tag hz-tag--on-media">آموزش</span>
              </RecordImage>
              <div className="hz-article__body">
                {lead.categoryNameFa ? <span className="hz-article__kicker">{lead.categoryNameFa}</span> : null}
                <h3 className="hz-article__title">{lead.titleFa}</h3>
                <p className="hz-article__summary">{lead.summaryFa}</p>
                <div className="hz-meta">
                  <ReadTimeMeta card={lead} />
                  <time className="hz-meta__item" dateTime={lead.publishAt.toISOString()}>
                    {dateFa(lead.publishAt)}
                  </time>
                  <span className="hz-meta__item">{lead.byline}</span>
                </div>
              </div>
            </Link>
          </div>
        ) : null}
        {rest.length > 0 ? (
          <ul className="hz-featured__list lg:col-span-5">
            {rest.map(({ item, path, kind }) => (
              <li key={path + item.slug}>
                <Link className="hz-article hz-article--horizontal" href={path + item.slug} title={item.titleFa}>
                  <RecordImage variant="4x3" fileId={item.imageFileId} altFa={item.imageAltFa} />
                  <div className="hz-article__body">
                    <span className="hz-tag">{kind}</span>
                    <h3 className="hz-article__title">{item.titleFa}</h3>
                    <div className="hz-meta">
                      <ReadTimeMeta card={item} />
                      <time className="hz-meta__item" dateTime={item.publishAt.toISOString()}>
                        {dateFa(item.publishAt)}
                      </time>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Frame>
  );
}

// ── 2 · Hero ──────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section aria-labelledby="home-title" className="hz-frame hz-frame--peach hz-hero">
      <div className="hz-hero__text">
        <span className="hz-tag self-start">سامانه رسمی ثبت حیوان</span>
        <h1 id="home-title" className="hz-display">
          ثبت رسمی و پیگیری سگ‌ها، در یک‌جا
        </h1>
        <p className="hz-body-lg m-0">
          از ثبت حیوان و تأیید دامپزشک معتمد تا صدور برگه ثبتی، شجره‌نامه و مجوز جفت‌گیری؛ هر پرونده با یک شناسه رسمی و قابل استعلام.
        </p>
        <div className="hz-hero__actions">
          <ButtonLink href="/animals/new" size="lg" iconStart="plus">
            ثبت حیوان
          </ButtonLink>
          <ButtonLink tone="secondary" size="lg" href="/veterinarians">
            یافتن دامپزشک معتمد
          </ButtonLink>
          <ButtonLink tone="secondary" size="lg" href="/verify" iconStart="shieldCheck" className="hz-hide-md">
            استعلام اصالت سند
          </ButtonLink>
        </div>
        <form
          method="get"
          action="/verify"
          role="search"
          aria-label="استعلام اصالت سند"
          className="hz-card hz-card--feature hz-show-md mt-sm flex flex-col gap-sm !bg-bg-surface"
          data-testid="home-verify"
        >
          <label htmlFor="home-verify-code" className="hz-field__label flex items-center gap-sm font-bold">
            <Icon name="shieldCheck" size="sm" className="text-text-brand" />
            استعلام اصالت سند
          </label>
          <div className="hz-search-row">
            <div className="hz-input-wrap hz-search">
              <input
                id="home-verify-code"
                name="code"
                dir="ltr"
                className="hz-input hz-input--ltr"
                placeholder="RS-4KQ7MZ2D"
                autoComplete="off"
                aria-describedby="home-verify-hint"
              />
            </div>
            <button type="submit" className="hz-btn hz-btn--secondary hz-btn--lg">
              استعلام
            </button>
          </div>
          <p id="home-verify-hint" className="hz-field__hint m-0">
            شماره برگه ثبتی، شجره‌نامه، مجوز یا کارت توله را وارد کنید.
          </p>
        </form>
      </div>
      <HeroCarousel slides={HERO_SLIDES} />
    </section>
  );
}

// ── 3 · «دنبال چه می‌گردید؟» ─────────────────────────────────────────────

function QuickSection() {
  return (
    <Frame id="find-title" title="دنبال چه می‌گردید؟" cream>
      <ul className="grid grid-cols-2 gap-sm md:grid-cols-3 md:gap-s20 lg:grid-cols-5 lg:gap-lg" data-testid="home-quick">
        {QUICK.map((entry, index) => (
          <li key={entry.href} className={index === QUICK.length - 1 ? 'col-span-2 md:col-span-1' : undefined}>
            <Link
              href={entry.href}
              className="hz-card hz-card--feature hz-card--interactive hz-service-card flex h-full min-h-14 items-center md:block"
            >
              <span className="hz-service flex-1">
                <span className="hz-service__title max-md:text-[15px]">
                  {entry.label}
                  <Icon name="arrowRight" size="sm" mirror className="text-text-brand" />
                </span>
                <span className="hz-service__desc hz-show-md">{entry.descFa}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// ── 4 · «نژادهای سگ» ──────────────────────────────────────────────────────

/** P01 row 5: the content admin's choice, else the first published breed with a photo, history and all five traits. */
async function featuredBreed() {
  const chosen = await homeSetting('home.featured_breed_slug');
  const complete = and(
    eq(referenceBreeds.profileStatus, 'PUBLISHED'),
    isNull(referenceBreeds.mergedIntoBreedId),
    isNotNull(referenceBreeds.imageFileId),
    isNotNull(referenceBreeds.historyFa),
    isNotNull(referenceBreeds.energy),
    isNotNull(referenceBreeds.trainability),
    isNotNull(referenceBreeds.careNeed),
    isNotNull(referenceBreeds.withChildren),
    isNotNull(referenceBreeds.withOtherAnimals),
  );
  if (chosen) {
    const [picked] = await db().select().from(referenceBreeds).where(and(complete, eq(referenceBreeds.slug, chosen))).limit(1);
    if (picked) return picked;
  }
  const [first] = await db().select().from(referenceBreeds).where(complete).orderBy(asc(referenceBreeds.nameFa)).limit(1);
  return first ?? null;
}

async function BreedsSection() {
  const data = await attempt(() => Promise.all([featuredBreed(), publishedBreeds(db(), { page: 1, pageSize: 6 })]));
  if (data === null) return <FrameError id="breeds-title" title="نژادهای سگ" />;
  const [feature, breeds] = data;
  const tiles = breeds.items.filter((breed) => breed.slug !== feature?.slug).slice(0, 5);
  if (!feature && tiles.length === 0) return null;
  const firstParagraph = feature?.historyFa?.split(/\n\s*\n/)[0]?.trim() ?? '';

  return (
    <Frame id="breeds-title" title="نژادهای سگ" link={{ href: '/breeds', label: 'همه نژادها' }} testId="home-breeds-section">
      {feature ? (
        <div className="hz-breed-feature" data-testid="home-featured-breed">
          <figure className="hz-breed-feature__media">
            <img src={'/media/' + feature.imageFileId} alt={feature.imageAltFa ?? ''} loading="lazy" decoding="async" width={960} height={600} />
          </figure>
          <div className="hz-breed-feature__info">
            <span className="hz-overline">نژاد این ماه</span>
            <h3 className="hz-breed-feature__title">
              {feature.nameFa}
              <bdi className="hz-breed__en" dir="ltr">
                {feature.nameEn}
              </bdi>
            </h3>
            {firstParagraph ? <p className="hz-body-lg m-0 line-clamp-4">{firstParagraph}</p> : null}
            <BreedTraits breed={feature} />
            <ButtonLink tone="secondary" href={'/breeds/' + feature.slug} className="self-start">
              {'شناسنامه نژاد ' + feature.nameFa}
            </ButtonLink>
          </div>
        </div>
      ) : null}
      {tiles.length > 0 ? (
        <ul className="hz-row" style={row(5, 3, '44%')} data-testid="home-breeds">
          {tiles.map((breed) => (
            <li key={breed.slug}>
              <Link href={'/breeds/' + breed.slug} className="hz-animal-tile hz-card--interactive">
                <RecordImage variant="4x3" fileId={breed.imageFileId} altFa={breed.imageAltFa} />
                <div className="hz-animal-tile__body">
                  <span className="hz-breed__name">{breed.nameFa}</span>
                  <bdi className="hz-breed__en" dir="ltr">
                    {breed.nameEn}
                  </bdi>
                  <span className="hz-breed__meta">
                    {[breed.fciGroup ? 'گروه ' + fa(breed.fciGroup) : null, breed.size ? SIZE_FA[breed.size] : null]
                      .filter(Boolean)
                      .join('، ') || breed.groupNameFa}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </Frame>
  );
}

// ── 5 · «بازار همزیست» ────────────────────────────────────────────────────

async function MarketSection() {
  const data = await attempt(() =>
    Promise.all([publicListings(db(), { ...EMPTY_FILTER, page: 1, pageSize: 4 }), shopPage(db(), parseShopFilter({}))]),
  );
  if (data === null) return <FrameError id="market-title" title="بازار همزیست" cream />;
  const listings = data[0].items.slice(0, 4);
  const products = data[1].items.slice(0, 4);
  if (listings.length === 0 && products.length === 0) return null;

  return (
    <Frame id="market-title" title="بازار همزیست" link={{ href: '/animals-market', label: 'همه آگهی‌ها و کالاها' }} cream testId="home-market">
      {listings.length > 0 ? (
        <>
          <h3 className="hz-subhead">
            <Icon name="pawPrint" size="sm" />
            آگهی‌های حیوان
          </h3>
          <ul className="hz-row" style={row(4, 2, '64%')}>
            {listings.map((card) => (
              <li key={card.id}>
                <ListingCard card={card} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {products.length > 0 ? (
        <>
          <h3 className="hz-subhead">
            <Icon name="storefront" size="sm" />
            از فروشگاه
          </h3>
          <ul className="hz-row" style={row(4, 2, '56%')}>
            {products.map((item) => (
              <li key={item.id}>
                <ProductCard item={item} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Frame>
  );
}

// ── 6 · «دامپزشکان و مراکز معتمد» ─────────────────────────────────────────

async function DirectorySection() {
  const data = await attempt(() =>
    Promise.all([
      publishedVets(db(), { status: 'TRUSTED', page: 1, pageSize: 4 }),
      publishedCentres(db(), { verified: true, page: 1, pageSize: 3 }),
    ]),
  );
  if (data === null) return <FrameError id="directory-title" title="دامپزشکان و مراکز معتمد" />;
  const [vets, centres] = data;
  if (vets.items.length === 0 && centres.items.length === 0) return null;

  return (
    <Frame id="directory-title" title="دامپزشکان و مراکز معتمد" link={{ href: '/veterinarians', label: 'راهنمای دامپزشکی' }} testId="home-directory">
      {vets.items.length > 0 ? (
        <>
          <h3 className="hz-subhead">
            <Icon name="stethoscope" size="sm" />
            دامپزشکان معتمد
          </h3>
          <ul className="hz-row hz-row--stack" style={row(4, 2, '100%')}>
            {vets.items.map((vet) => (
              <li key={vet.slug}>
                <VetCard vet={vet} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {centres.items.length > 0 ? (
        <>
          <h3 className="hz-subhead">
            <Icon name="buildings" size="sm" />
            مراکز دامپزشکی
          </h3>
          <ul className="hz-row" style={row(3, 2, '80%')}>
            {centres.items.map((centre) => (
              <li key={centre.slug}>
                <CentreCard centre={centre} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Frame>
  );
}

// ── 7 · «انجمن‌ها و کلاب‌ها» ──────────────────────────────────────────────

async function CommunitiesSection() {
  const communities = await attempt(() => publishedCommunities(db(), { page: 1, pageSize: 4 }));
  if (communities === null) return <FrameError id="communities-title" title="انجمن‌ها و کلاب‌ها" cream />;
  if (communities.items.length === 0) return null;

  return (
    <Frame id="communities-title" title="انجمن‌ها و کلاب‌ها" link={{ href: '/associations' }} cream>
      <ul className="hz-row" style={row(4, 2, '72%')} data-testid="home-communities">
        {communities.items.map((community) => (
          <li key={community.slug}>
            <Link href={'/associations/' + community.slug} className="hz-card hz-card--flush hz-card--interactive hz-club-cover">
              <RecordImage variant="banner" fileId={community.imageFileId} altFa={community.imageAltFa} />
              <div className="hz-card__section hz-club-cover__body">
                <h3 className="hz-entity__name">{community.nameFa}</h3>
                <span className="hz-entity__meta">
                  {[COMMUNITY_KIND_FA[community.kind], COMMUNITY_SCOPE_FA[community.scopeFa as never] ?? community.scopeFa]
                    .filter(Boolean)
                    .join('، ')}
                </span>
                {community.nextEvent ? (
                  <div className="hz-community__event">
                    <Icon name="calendarBlank" size="xs" />
                    <span className="hz-community__event-text">
                      <span className="hz-visually-hidden">رویداد پیش‌رو: </span>
                      <span className="hz-community__event-title">{community.nextEvent.titleFa}</span>
                      <span className="hz-community__event-when">{formatCivilDateFa(community.nextEvent.startsOn)}</span>
                      {community.nextEvent.placeFa ? (
                        <span className="hz-community__event-when">{community.nextEvent.placeFa}</span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// ── 8 · «همزیست در یک نگاه» ───────────────────────────────────────────────

async function GlanceSection() {
  // Four counts from records, each hidden when it fails or is zero — never invented.
  const [registered, vets, centres, communities] = await Promise.all([
    attempt(async () => {
      const [counted] = await db().select({ value: count() }).from(animals).where(eq(animals.status, 'REGISTERED'));
      return Number(counted?.value ?? 0);
    }),
    attempt(async () => (await publishedVets(db(), { status: 'TRUSTED', page: 1, pageSize: 1 })).total),
    attempt(async () => (await publishedCentres(db(), { page: 1, pageSize: 1 })).publishedTotal),
    attempt(async () => (await publishedCommunities(db(), { page: 1, pageSize: 1 })).publishedTotal),
  ]);
  const stats: ReadonlyArray<{ label: string; value: number | null; icon: IconName }> = [
    { label: 'حیوان ثبت‌شده', value: registered, icon: 'pawPrint' },
    { label: 'دامپزشک معتمد', value: vets, icon: 'stethoscope' },
    { label: 'مرکز دامپزشکی', value: centres, icon: 'buildings' },
    { label: 'انجمن و کلاب فعال', value: communities, icon: 'usersThree' },
  ];
  const shown = stats.filter((stat) => stat.value !== null && stat.value > 0);

  return (
    <section className="hz-glance" aria-labelledby="glance-title" data-testid="home-glance">
      <SectionHeader id="glance-title" title="همزیست در یک نگاه" count={shown.length > 0 ? 'تا ' + dateFa(new Date()) : undefined} />
      {shown.length > 0 ? (
        <dl className="hz-glance__stats" data-testid="home-stats">
          {shown.map((stat) => (
            <div key={stat.label} className="hz-glance__stat">
              <dt className="hz-glance__label">
                <Icon name={stat.icon} size="sm" />
                {stat.label}
              </dt>
              <dd className="hz-glance__value">{fa(stat.value!)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <ol className="hz-glance__steps" aria-label="روش کار">
        {STEPS.map((step, index) => (
          <li key={step.title} className="hz-glance__step">
            <figure className="hz-glance__step-media">
              <img src={step.src} alt="" loading="lazy" decoding="async" width={240} height={240} />
            </figure>
            <div className="hz-glance__step-text">
              <span className="hz-glance__step-num">{'قدم ' + fa(index + 1)}</span>
              <h3 className="hz-h4">{step.title}</h3>
              <p className="hz-body-sm hz-muted m-0">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── 9 · «خدمات همزیست» (decision 14: no fee on a public page) ─────────────

function ServicesSection() {
  return (
    <Frame id="services-title" title="خدمات همزیست" link={{ href: '/services' }} cream>
      <ul className="grid gap-sm md:grid-cols-2 md:gap-s20 lg:grid-cols-3 lg:gap-lg" data-testid="home-services">
        {SERVICE_CATALOGUE.map((service) => (
          <li key={service.slug}>
            <Link
              href={servicePath(service.slug)}
              className="hz-card hz-card--feature hz-card--interactive hz-service-card h-full"
              data-testid={'home-service-' + service.slug}
            >
              <div className="hz-service">
                <h3 className="hz-service__title">
                  {service.titleFa}
                  <Icon name="arrowRight" size="sm" mirror />
                </h3>
                <p className="hz-service__desc">{service.summaryFa}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Frame>
  );
}

// ── 10 · CtaBand --media ──────────────────────────────────────────────────

async function CtaSection() {
  const [path, altFa] = await Promise.all([homeSetting('home.cta_image_path'), homeSetting('home.cta_image_alt_fa')]);
  // Only an approved brand photo, served by this site, with its alt text — never a remote address.
  const media = path && altFa && /^\/brand\/imagery\/[a-z0-9-]+\.(?:jpg|webp)$/.test(path) ? { src: path, altFa } : CTA_FALLBACK;
  return <CtaBand id="cta-title" media={media} />;
}

