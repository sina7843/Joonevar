import test from 'node:test';
import assert from 'node:assert/strict';
import { absoluteUrl, buildMetadata, type SiteContext } from '../../src/seo/metadata.ts';
import { breadcrumbLd, organizationLd, serializeJsonLd, websiteLd } from '../../src/seo/structured-data.ts';
import { robotsFor, robotsRuleMatches } from '../../src/seo/robots.ts';
import { SITEMAP_SECTIONS, sitemapIndexXml, sitemapSection, urlSetXml } from '../../src/seo/sitemap.ts';
import { PUBLIC_SECTIONS, liveSections } from '../../src/public/sections.ts';
import { accessForRoute, applicationPrefixes } from '../../src/authz/routes.ts';

const PROD: SiteContext = { origin: 'https://hamzist.example', production: true };
const STAGING: SiteContext = { origin: 'https://staging.hamzist.example', production: false };

type Og = { locale: string; url: string; images: Array<{ url: string }> };

test('canonical is absolute, on the configured origin, and ignores query, fragment and trailing slash', () => {
  assert.equal(absoluteUrl(PROD.origin, '/about?utm_source=x#team'), 'https://hamzist.example/about');
  assert.equal(absoluteUrl(PROD.origin, '/about/'), 'https://hamzist.example/about');
  assert.equal(absoluteUrl(PROD.origin, '/'), 'https://hamzist.example/');
  assert.equal(
    absoluteUrl(PROD.origin, '/breeds/ژرمن-شپرد'),
    'https://hamzist.example/breeds/' + encodeURIComponent('ژرمن-شپرد'),
  );
  // A path that is really another host is refused, never followed.
  assert.throws(() => absoluteUrl(PROD.origin, '//evil.example/x'));
  assert.throws(() => absoluteUrl(PROD.origin, 'https://evil.example/x'));
});

test('a published page is indexable in production, with Persian OpenGraph on the same canonical', () => {
  const metadata = buildMetadata({ title: 'نژادها', description: 'بانک نژاد سگ', path: '/breeds' }, PROD);
  assert.deepEqual(metadata.robots, { index: true, follow: true });
  assert.equal(metadata.alternates?.canonical, 'https://hamzist.example/breeds');
  assert.deepEqual(metadata.title, { absolute: 'نژادها | همزیست' });
  const og = metadata.openGraph as Og;
  assert.equal(og.locale, 'fa_IR');
  assert.equal(og.url, 'https://hamzist.example/breeds');
  // The dedicated social asset of the handoff, not the bare symbol stand-in.
  assert.equal(og.images[0]!.url, 'https://hamzist.example/brand/app-icon-social.png');

  // A title that already names the site is not suffixed a second time.
  const about = buildMetadata({ title: 'درباره همزیست', description: 'توضیح', path: '/about' }, PROD);
  assert.deepEqual(about.title, { absolute: 'درباره همزیست' });
});

test('an archived record stays reachable and followable but leaves the index', () => {
  const metadata = buildMetadata(
    { title: 'خبر قدیمی', description: 'بایگانی', path: '/news/old', state: 'ARCHIVED' },
    PROD,
  );
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.equal(metadata.alternates?.canonical, 'https://hamzist.example/news/old');
});

test('a duplicate hands its canonical to the primary record and is not indexed', () => {
  const metadata = buildMetadata(
    { title: 'ژرمن شپرد', description: 'تکراری', path: '/breeds/gsd-2', state: 'DUPLICATE', primaryPath: '/breeds/gsd' },
    PROD,
  );
  assert.deepEqual(metadata.robots, { index: false, follow: true });
  assert.equal(metadata.alternates?.canonical, 'https://hamzist.example/breeds/gsd');
  assert.equal((metadata.openGraph as Og).url, 'https://hamzist.example/breeds/gsd');

  assert.throws(
    () => buildMetadata({ title: 'x', description: 'y', path: '/breeds/gsd-2', state: 'DUPLICATE' }, PROD),
    /duplicates/,
  );
});

test('nothing is indexed or followed outside production, and a page must describe itself', () => {
  const metadata = buildMetadata({ title: 'خانه', description: 'توضیح', path: '/' }, STAGING);
  assert.deepEqual(metadata.robots, { index: false, follow: false });
  assert.throws(() => buildMetadata({ title: ' ', description: 'y', path: '/' }, PROD));
  assert.throws(() => buildMetadata({ title: 'x', description: '', path: '/' }, PROD));
});

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

test('JSON-LD cannot close its script element and still parses to the same value', () => {
  const value = { name: '</script><script>alert(1)</script>', note: 'a & b ' + LS + PS };
  const out = serializeJsonLd(value);
  for (const forbidden of ['<', '>', '&', LS, PS]) assert.ok(!out.includes(forbidden), JSON.stringify(forbidden));
  assert.deepEqual(JSON.parse(out), value);
});

test('breadcrumbs are numbered from one with absolute items', () => {
  const data = breadcrumbLd(
    [
      { name: 'خانه', path: '/' },
      { name: 'درباره همزیست', path: '/about' },
    ],
    PROD.origin,
  ) as { itemListElement: Array<{ position: number; item: string; name: string }> };
  assert.deepEqual(
    data.itemListElement.map((entry) => [entry.position, entry.item]),
    [
      [1, 'https://hamzist.example/'],
      [2, 'https://hamzist.example/about'],
    ],
  );
});

test('organisation and website data carry only facts the site holds', () => {
  assert.deepEqual(Object.keys(organizationLd(PROD.origin)).sort(), ['@context', '@type', 'logo', 'name', 'url']);
  // No SearchAction until site search exists (PROMPT-012).
  assert.equal((websiteLd(PROD.origin) as Record<string, unknown>).potentialAction, undefined);
});

test('robots closes the whole site outside production', () => {
  assert.deepEqual(robotsFor(STAGING, applicationPrefixes()), { rules: [{ userAgent: '*', disallow: '/' }] });
});

test('in production robots hides every application route and no public section', () => {
  const robots = robotsFor(PROD, applicationPrefixes());
  const disallow = (robots.rules as Array<{ disallow: string[] }>)[0]!.disallow;
  const blocked = (path: string) => disallow.some((rule) => robotsRuleMatches(rule, path));

  assert.ok(applicationPrefixes().length > 0);
  for (const prefix of applicationPrefixes()) {
    assert.ok(blocked(prefix), prefix);
    assert.ok(blocked(prefix + '/some-id'), prefix + '/some-id');
  }
  for (const path of ['/api/health', '/dev/patterns']) assert.ok(blocked(path), path);

  for (const section of PUBLIC_SECTIONS) {
    assert.ok(!blocked(section.href), section.href + ' must stay crawlable');
    if (section.href !== '/') assert.ok(!blocked(section.href + '/some-slug'), section.href + '/some-slug');
  }
  // The trusted vet panel `/vet` and the Phase 1 finder `/vets` share letters
  // with the public directory; a plain prefix rule would have hidden it.
  assert.ok(blocked('/vet/check-in') && blocked('/vets'));
  assert.ok(!blocked('/veterinarians'));
  assert.equal(robots.sitemap, 'https://hamzist.example/sitemap.xml');
});

test('only built sections are linked; each is public and every planned one stays closed', () => {
  assert.deepEqual(
    PUBLIC_SECTIONS.map((section) => section.label),
    ['خانه', 'دامپزشکان', 'مراکز دامپزشکی', 'نژادهای سگ', 'آموزش‌ها', 'اخبار', 'انجمن‌ها و کلاب‌ها', 'استعلام اصالت', 'درباره همزیست'],
  );
  for (const section of PUBLIC_SECTIONS) {
    if (section.live) assert.equal(accessForRoute(section.href), 'PUBLIC', section.href);
    else assert.deepEqual(accessForRoute(section.href), [], section.href + ' opens with PROMPT-' + section.prompt);
  }
  assert.deepEqual(
    liveSections().map((section) => section.href),
    ['/', '/veterinarians', '/centers', '/breeds', '/articles', '/news', '/associations', '/verify', '/about'],
  );
});

test('the sitemap index lists each section and a section lists only live pages', async () => {
  const index = sitemapIndexXml(Object.keys(SITEMAP_SECTIONS), PROD.origin);
  assert.match(index, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(index, /<loc>https:\/\/hamzist\.example\/sitemaps\/pages\.xml<\/loc>/);

  const pages = await sitemapSection('pages')!();
  assert.deepEqual(
    pages.map((entry) => entry.path),
    liveSections().map((section) => section.href),
  );
  const xml = urlSetXml(pages, PROD.origin);
  assert.ok(!xml.includes('<lastmod>'), 'a static page has no real modification date to report');
  assert.ok(!xml.includes('/dashboard'));
});

test('sitemap values are escaped, real dates are kept, and unknown sections are not found', () => {
  const xml = urlSetXml([{ path: '/news/a&b', lastModified: new Date('2026-01-02T00:00:00Z') }], PROD.origin);
  assert.ok(xml.includes('<loc>https://hamzist.example/news/a&amp;b</loc>'));
  assert.ok(xml.includes('<lastmod>2026-01-02T00:00:00.000Z</lastmod>'));
  assert.equal(sitemapSection('missing'), null);
  assert.equal(sitemapSection('constructor'), null);
});
