import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '../../src/ui/button.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import type { IconName } from '../../src/ui/icon-paths.ts';
import { RecordImage } from '../../src/ui/record-image.tsx';
import { SectionHeader } from '../../src/ui/section-header.tsx';
import { HeroCarousel } from '../../src/public/hero-carousel.tsx';
import { JsonLdScript } from '../../src/seo/json-ld.tsx';
import { buildMetadata } from '../../src/seo/metadata.ts';
import { organizationLd, websiteLd } from '../../src/seo/structured-data.ts';
import { site } from '../../src/public/request.ts';
import { db } from '../../src/db/client.ts';
import { SERVICE_CATALOGUE, servicePath } from '../../src/services/catalogue.ts';
import { publishedBreeds } from '../../src/breeds/service.ts';
import { SIZE_FA } from '../../src/breeds/model.ts';
import { publishedVets } from '../../src/vets/directory.ts';
import { publishedCentres } from '../../src/centres/service.ts';
import { publishedCommunities } from '../../src/communities/service.ts';
import { COMMUNITY_KIND_FA, COMMUNITY_SCOPE_FA } from '../../src/communities/model.ts';
import { publicContentList } from '../../src/content/service.ts';

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

const STEPS: ReadonlyArray<{ title: string; body: string }> = [
  { title: 'ورود با شماره موبایل', body: 'با کد یک‌بارمصرف وارد می‌شوید؛ حساب تازه همان‌جا ساخته می‌شود.' },
  { title: 'تکمیل و احراز هویت', body: 'اطلاعات هویتی و تصویر کارت ملی را برای بررسی می‌فرستید.' },
  { title: 'ثبت حیوان و درخواست خدمت', body: 'از پنل خود حیوان را ثبت می‌کنید و هر خدمت را قدم‌به‌قدم پیگیری می‌کنید.' },
];

/** P01 «دنبال چه می‌گردید؟»: the five quick entries (v1.0.3), approved copy. */
const QUICK: ReadonlyArray<{ href: string; label: string; descFa: string; icon: IconName }> = [
  { href: '/veterinarians', label: 'دامپزشکان', descFa: 'دامپزشک معتمد نزدیک خود را پیدا کنید', icon: 'stethoscope' },
  { href: '/centers', label: 'مراکز دامپزشکی', descFa: 'کلینیک، بیمارستان و آزمایشگاه', icon: 'buildings' },
  { href: '/breeds', label: 'نژادهای سگ', descFa: 'ویژگی‌ها، نگهداری و تاریخچه', icon: 'pawPrint' },
  { href: '/animals-market', label: 'بازار فروش حیوان', descFa: 'آگهی‌های بررسی‌شده با شناسه ثبت', icon: 'storefront' },
  { href: '/shop', label: 'فروشگاه کالا', descFa: 'غذا، لوازم و بهداشت', icon: 'shoppingBag' },
];

/** Brand imagery of the home hero (images-manifest `home/*`), approved alt text. */
const HERO_SLIDES = [
  { src: '/brand/imagery/sample-hero-dog.jpg', altFa: 'زنی با گربه و سگ ژرمن شپرد روی مبل خانه' },
  { src: '/brand/imagery/home-hero-sarabi-courtyard.jpg', altFa: 'مردی کنار سگ سرابی‌اش در حیاط باغ ایرانی' },
  { src: '/brand/imagery/home-hero-cat-owner.jpg', altFa: 'زنی با گربه خاکستری‌اش کنار پنجره آفتابی خانه' },
] as const;

/**
 * Home — Requirements-Phase-2 §5 (PROMPT-013), drawn as DS pattern P01 / key
 * screen K1 (v1.0.3 order): «تازه‌ها» first on white, the Hero in the one cream
 * band, five quick entries, breeds, communities, the stat box, services, the
 * three steps and the CTA band. A section disappears with its header when its
 * data does not exist yet: an empty shelf or a made-up number would claim
 * something the site cannot do.
 */
export default async function HomePage() {
  const { origin } = site();
  const [breeds, vets, centres, communities, articles, news, announcements] = await Promise.all([
    publishedBreeds(db(), { page: 1, pageSize: 6 }),
    publishedVets(db(), { page: 1, pageSize: 1 }),
    publishedCentres(db(), { page: 1, pageSize: 1 }),
    publishedCommunities(db(), { page: 1, pageSize: 3 }),
    publicContentList(db(), { kind: 'ARTICLE', page: 1, pageSize: 2 }),
    publicContentList(db(), { kind: 'NEWS', page: 1, pageSize: 2 }),
    publicContentList(db(), { kind: 'ANNOUNCEMENT', page: 1, pageSize: 1 }),
  ]);

  // §5: figures only where they are counted from real published records.
  const stats: ReadonlyArray<{ label: string; value: number; href: string }> = [
    { label: 'دامپزشک منتشرشده', value: vets.publishedTotal, href: '/veterinarians' },
    { label: 'مرکز دامپزشکی', value: centres.publishedTotal, href: '/centers' },
    { label: 'نژاد سگ', value: breeds.publishedTotal, href: '/breeds' },
    { label: 'انجمن و کلاب', value: communities.publishedTotal, href: '/associations' },
    { label: 'آموزش', value: articles.visibleTotal, href: '/articles' },
  ].filter((row) => row.value > 0);

  const lead = articles.items[0] ?? null;
  const rest = [
    ...articles.items.slice(1).map((item) => ({ item, path: '/articles/', kind: 'آموزش' })),
    ...news.items.map((item) => ({ item, path: '/news/', kind: 'خبر' })),
    ...announcements.items.map((item) => ({ item, path: '/announcements/', kind: 'اطلاعیه' })),
  ].slice(0, 4);

  return (
    <div className="space-y-s48 lg:space-y-s64">
      <JsonLdScript data={organizationLd(origin)} />
      <JsonLdScript data={websiteLd(origin)} />

      {/* 1 · «تازه‌ها»: one feature card and the latest list, on white. */}
      {lead || rest.length > 0 ? (
        <section aria-labelledby="reading-title">
          <SectionHeader id="reading-title" title="تازه‌ها" link={{ href: '/articles', label: 'همه مطالب مجله' }} />
          <div className="hz-story-row" data-testid="home-reading">
            {lead ? (
              <Link className="hz-article hz-article--feature" href={'/articles/' + lead.slug}>
                <RecordImage variant="banner" fileId={lead.imageFileId} altFa={lead.imageAltFa} priority />
                <div className="hz-article__body">
                  <span className="hz-tag">{lead.categoryNameFa ?? 'آموزش'}</span>
                  <h3 className="hz-article__title">{lead.titleFa}</h3>
                  <p className="hz-article__summary">{lead.summaryFa}</p>
                  <div className="hz-meta">
                    <time className="hz-meta__item" dateTime={lead.publishAt.toISOString()}>
                      {dateFa(lead.publishAt)}
                    </time>
                  </div>
                </div>
              </Link>
            ) : null}
            {rest.length > 0 ? (
              <ul className="hz-featured__list">
                {rest.map(({ item, path, kind }) => (
                  <li key={path + item.slug}>
                    <Link className="hz-article hz-article--horizontal" href={path + item.slug}>
                      <RecordImage variant="4x3" fileId={item.imageFileId} altFa={item.imageAltFa} />
                      <div className="hz-article__body">
                        <span className="hz-tag">{kind}</span>
                        <h3 className="hz-article__title">{item.titleFa}</h3>
                        <div className="hz-meta">
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
        </section>
      ) : null}

      {/* 2 · The Hero in the one cream band, edge to edge. */}
      <section aria-labelledby="home-title" className="hz-band hz-bleed">
        <div className="hz-container">
          <div className="hz-hero !py-0">
            <div className="hz-hero__text">
              <span className="hz-tag self-start">سامانه رسمی ثبت حیوان</span>
              <h1 id="home-title" className="hz-display">
                ثبت رسمی و پیگیری سگ‌ها، در یک‌جا
              </h1>
              <p className="hz-body-lg">
                هویت حیوان، برگه ثبتی، شجره‌نامه و مسیر جفت‌گیری را با تأیید دامپزشک معتمد و انجمن ثبت و دنبال کنید.
              </p>
              <div className="hz-hero__actions">
                <ButtonLink href="/animals/new" size="lg" iconStart="plus">
                  ثبت حیوان
                </ButtonLink>
                <ButtonLink tone="secondary" size="lg" href="/veterinarians">
                  یافتن دامپزشک معتمد
                </ButtonLink>
              </div>
              <form method="get" action="/verify" role="search" className="hz-card hz-card--compact hz-show-md" data-testid="home-verify">
                <label htmlFor="home-verify-code" className="flex items-center gap-sm text-label-md">
                  <Icon name="shieldCheck" size="sm" className="text-logo-mark" />
                  استعلام اصالت سند
                </label>
                <div className="mt-sm flex gap-sm">
                  <input
                    id="home-verify-code"
                    name="code"
                    dir="ltr"
                    className="hz-input hz-input--ltr hz-input--sm"
                    placeholder="RS-4KQ7MZ2D"
                    aria-describedby="home-verify-hint"
                    aria-label="شناسه سند برای استعلام اصالت"
                  />
                  <button type="submit" className="hz-btn hz-btn--secondary">
                    استعلام
                  </button>
                </div>
                <p id="home-verify-hint" className="hz-caption mt-xs">
                  شناسه برگه ثبتی، شجره‌نامه، مجوز یا کارت توله را وارد کنید.
                </p>
              </form>
              <ButtonLink tone="secondary" href="/verify" block iconStart="shieldCheck" className="hz-hide-md">
                استعلام اصالت سند
              </ButtonLink>
            </div>
            <HeroCarousel slides={HERO_SLIDES} />
          </div>
        </div>
      </section>

      {/* 3 · Five quick entries (no search field: the header has it). */}
      <section aria-labelledby="find-title">
        <SectionHeader id="find-title" title="دنبال چه می‌گردید؟" />
        <ul className="grid grid-cols-2 gap-s20 md:grid-cols-3 lg:grid-cols-5" data-testid="home-quick">
          {QUICK.map((entry, index) => (
            <li key={entry.href} className={index === QUICK.length - 1 ? 'col-span-2 md:col-span-1' : undefined}>
              <Link href={entry.href} className="hz-card hz-card--feature hz-card--interactive flex h-full items-start justify-between gap-sm">
                <span className="min-w-0">
                  <span className="flex items-center gap-sm text-h4">
                    <Icon name={entry.icon} size="sm" className="text-text-brand" />
                    {entry.label}
                  </span>
                  <span className="hz-caption hz-show-md mt-2xs block">{entry.descFa}</span>
                </span>
                <Icon name="arrowRight" size="sm" mirror className="text-icon-default" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {breeds.items.length > 0 ? (
        <section aria-labelledby="breeds-title">
          <SectionHeader id="breeds-title" title="نژادهای سگ" link={{ href: '/breeds', label: 'همه نژادها' }} />
          <ul className="grid grid-cols-2 gap-s20 md:grid-cols-3 lg:grid-cols-6" data-testid="home-breeds">
            {breeds.items.map((breed) => (
              <li key={breed.slug}>
                <Link href={'/breeds/' + breed.slug} className="hz-animal-tile hz-card--interactive h-full">
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
        </section>
      ) : null}

      {communities.items.length > 0 ? (
        <section aria-labelledby="communities-title">
          <SectionHeader id="communities-title" title="انجمن‌ها و کلاب‌ها" link={{ href: '/associations' }} />
          <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="home-communities">
            {communities.items.map((community) => (
              <li key={community.slug}>
                <Link href={'/associations/' + community.slug} className="hz-card hz-card--interactive hz-community h-full">
                  <div className="hz-entity">
                    <RecordImage variant="avatar" fileId={community.imageFileId} altFa={community.imageAltFa} />
                    <div className="hz-entity__body">
                      <h3 className="hz-entity__name">{community.nameFa}</h3>
                      <span className="hz-entity__meta">
                        {[COMMUNITY_KIND_FA[community.kind], COMMUNITY_SCOPE_FA[community.scopeFa as never] ?? community.scopeFa, community.placeFa].filter(Boolean).join('، ')}
                      </span>
                    </div>
                  </div>
                  {community.upcomingEvents > 0 ? (
                    <div className="hz-community__event">
                      <Icon name="calendarBlank" size="sm" />
                      <span className="hz-community__event-text">
                        <span className="hz-community__event-title">{fa(community.upcomingEvents) + ' رویداد پیش‌رو'}</span>
                      </span>
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stats.length > 0 ? (
        <section aria-labelledby="stats-title" className="hz-card hz-card--feature rounded-2xl">
          <SectionHeader size="sm" id="stats-title" title="همزیست در یک نگاه" />
          <dl className="grid grid-cols-2 gap-lg sm:grid-cols-3 lg:grid-cols-5" data-testid="home-stats">
            {stats.map((stat) => (
              <div key={stat.label} className="hz-stat">
                <dt className="hz-stat__label order-2">{stat.label}</dt>
                <dd className="hz-stat__value order-1 m-0">
                  <Link href={stat.href} className="text-text-primary no-underline hover:text-text-brand">
                    {fa(stat.value)}
                  </Link>
                </dd>
              </div>
            ))}
          </dl>
          <p className="hz-caption mt-md">این عددها از رکوردهای منتشرشده همین لحظه شمرده می‌شوند.</p>
        </section>
      ) : null}

      <section aria-labelledby="services-title">
        <SectionHeader id="services-title" title="خدمات همزیست" link={{ href: '/services', label: 'همه خدمات' }} />
        <ul className="grid gap-s20 md:grid-cols-2 lg:grid-cols-3" data-testid="home-services">
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
      </section>

      <section aria-labelledby="steps-title">
        <SectionHeader id="steps-title" title="روش کار" />
        <ol className="grid gap-s20 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="hz-card hz-card--feature flex gap-md">
              <span className="hz-avatar shrink-0" aria-hidden="true">
                {fa(index + 1)}
              </span>
              <span>
                <h3 className="text-h4">{step.title}</h3>
                <p className="hz-body-sm mt-xs text-text-secondary">{step.body}</p>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="hz-cta" aria-labelledby="cta-title">
        <div className="hz-cta__text">
          <h2 className="hz-cta__title" id="cta-title">
            هویت حیوانت را ثبت کن
          </h2>
          <p className="hz-cta__body">ثبت در شش مرحله؛ هر مرحله ذخیره می‌شود و بعداً ادامه می‌دهید.</p>
        </div>
        <div className="hz-cta__actions">
          <ButtonLink href="/animals/new" size="lg" iconStart="plus">
            ثبت حیوان
          </ButtonLink>
          <ButtonLink tone="secondary" size="lg" href="/verify" iconStart="shieldCheck">
            استعلام اصالت سند
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
