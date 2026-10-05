/**
 * The public site's sections, in the order of Requirements-Phase-2 §4 and
 * Phase 2.5 §9.
 *
 * A section is linked from the header, footer and sitemap only once its prompt
 * has built it (`live`). Until then it is listed here so the order stays the
 * source's order, but nothing links to it: a link to a page that does not exist
 * yet is a dead end, not navigation (DEC-0149). `tests/ui/seo.test.ts` holds
 * every live section to a public route rule and every planned one to a closed
 * route, so the flag cannot drift from the access map.
 *
 * `nav: false` marks a page that belongs to the public site — it is crawled,
 * listed in the sitemap and linked from the page it belongs to — but does not
 * take a place in the top navigation, which has room for the sections a visitor
 * starts from rather than for every public address (PROMPT-014).
 */
export interface PublicSection {
  readonly href: string;
  readonly label: string;
  readonly live: boolean;
  /** Shown in the header and footer. Every live section is in the sitemap regardless. */
  readonly nav: boolean;
  /** The prompt that builds it. */
  readonly prompt: string;
}

export const PUBLIC_SECTIONS: readonly PublicSection[] = [
  { href: '/', label: 'خانه', live: true, nav: true, prompt: '002' },
  { href: '/veterinarians', label: 'دامپزشکان', live: true, nav: true, prompt: '006' },
  { href: '/centers', label: 'مراکز دامپزشکی', live: true, nav: true, prompt: '008' },
  { href: '/breeds', label: 'نژادهای سگ', live: true, nav: true, prompt: '003' },
  { href: '/articles', label: 'آموزش‌ها', live: true, nav: true, prompt: '004' },
  { href: '/news', label: 'اخبار', live: true, nav: true, prompt: '004' },
  // Built with the other two content kinds in PROMPT-004 but never linked; the
  // public navigation is completed here (PROMPT-014).
  { href: '/announcements', label: 'اطلاعیه‌ها', live: true, nav: true, prompt: '004' },
  { href: '/associations', label: 'انجمن‌ها و کلاب‌ها', live: true, nav: true, prompt: '010' },
  // Clubs became a first-class area in PROMPT-012 and get their own entry.
  { href: '/clubs', label: 'کلاب‌ها', live: true, nav: true, prompt: '012' },
  // The animal marketplace (Phase 3, PROMPT-004). Live and linked; the page
  // itself says so when the market's kill switch is closed.
  { href: '/animals-market', label: 'بازار فروش حیوان', live: true, nav: true, prompt: 'P3-004' },
  // The merchandise shop (Phase 3, PROMPT-009).
  { href: '/shop', label: 'فروشگاه کالا', live: true, nav: true, prompt: 'P3-009' },
  { href: '/services', label: 'خدمات', live: true, nav: true, prompt: '018' },
  { href: '/guides', label: 'راهنمای سامانه', live: true, nav: true, prompt: '014' },
  { href: '/verify', label: 'استعلام اصالت', live: true, nav: true, prompt: '014' },
  { href: '/about', label: 'درباره همزیست', live: true, nav: true, prompt: '002' },
  { href: '/contact', label: 'تماس با ما', live: true, nav: true, prompt: '014' },

  // Public pages reached from the section they explain rather than from the
  // top navigation (PROMPT-014).
  { href: '/parentage-test', label: 'تست اصالت نسب', live: true, nav: false, prompt: '014' },
  { href: '/association/membership', label: 'شرایط عضویت انجمن', live: true, nav: false, prompt: '014' },
  { href: '/association/regulations', label: 'مقررات انجمن', live: true, nav: false, prompt: '014' },
  { href: '/association/status', label: 'وضعیت‌ها و مراحل', live: true, nav: false, prompt: '014' },
];

export function liveSections(): readonly PublicSection[] {
  return PUBLIC_SECTIONS.filter((section) => section.live);
}

/** The live sections the header and footer link to. */
export function navSections(): readonly PublicSection[] {
  return PUBLIC_SECTIONS.filter((section) => section.live && section.nav);
}

/**
 * Header groups — DS *GroupedNav* (v1.0.3): five groups with a caret and a
 * panel, then «استعلام اصالت» as a plain link; «خانه» is the logo. Each item
 * names a section by its address, so a section that is not live drops out of
 * its group instead of linking to a dead end. Descriptions are the system's
 * approved copy.
 */
export interface NavGroupItem {
  readonly href: string;
  readonly descFa: string;
}
export interface NavGroup {
  readonly id: string;
  readonly labelFa: string;
  readonly parts: ReadonlyArray<{ readonly labelFa: string; readonly items: readonly NavGroupItem[] }>;
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    id: 'magazine',
    labelFa: 'مجله',
    parts: [
      {
        labelFa: 'مطالب',
        items: [
          { href: '/articles', descFa: 'راهنمای نگهداری، سلامت و ثبت' },
          { href: '/news', descFa: 'رویدادها و خبرهای انجمن‌ها و کلاب‌ها' },
          { href: '/announcements', descFa: 'مهلت‌ها و تغییرهای رسمی سامانه' },
        ],
      },
    ],
  },
  {
    id: 'vetguide',
    labelFa: 'راهنمای دامپزشکی',
    parts: [
      {
        labelFa: 'راهنما',
        items: [
          { href: '/veterinarians', descFa: 'دامپزشک معتمد نزدیک خود را پیدا کنید' },
          { href: '/centers', descFa: 'کلینیک، بیمارستان و آزمایشگاه' },
          { href: '/breeds', descFa: 'ویژگی‌ها، نگهداری و تاریخچه' },
        ],
      },
    ],
  },
  {
    id: 'community',
    labelFa: 'انجمن‌ها',
    parts: [
      {
        labelFa: 'انجمن و کلاب',
        items: [
          { href: '/associations', descFa: 'انجمن‌های رسمی و کلاب‌های نژاد' },
          { href: '/clubs', descFa: 'عضویت، رویدادها و قوانین هر کلاب' },
        ],
      },
    ],
  },
  {
    id: 'market',
    labelFa: 'بازار',
    parts: [
      {
        labelFa: 'خرید و فروش',
        items: [
          { href: '/animals-market', descFa: 'آگهی‌های بررسی‌شده با شناسه ثبت' },
          { href: '/shop', descFa: 'غذا، لوازم و بهداشت' },
        ],
      },
    ],
  },
  {
    id: 'services',
    labelFa: 'خدمات',
    parts: [
      {
        labelFa: 'خدمات سامانه',
        items: [
          { href: '/services', descFa: 'برگه ثبتی، شجره‌نامه، مجوز و تعرفه‌ها' },
          { href: '/guides', descFa: 'مراحل ثبت حیوان، پیگیری درخواست و دریافت سند، گام به گام' },
        ],
      },
      {
        labelFa: 'همزیست',
        items: [
          { href: '/about', descFa: 'سامانه رسمی ثبت سگ و گربه' },
          { href: '/contact', descFa: 'پشتیبانی و پاسخ به پرسش‌ها' },
        ],
      },
    ],
  },
];

/** The plain link after the groups. */
export const VERIFY_HREF = '/verify';

/** Footer groups — DS *SiteFooter*: the header grouping plus the off-nav pages. */
export const FOOTER_GROUPS: ReadonlyArray<{ readonly labelFa: string; readonly hrefs: readonly string[] }> = [
  { labelFa: 'مجله', hrefs: ['/articles', '/news', '/announcements'] },
  { labelFa: 'راهنمای دامپزشکی', hrefs: ['/veterinarians', '/centers', '/breeds'] },
  { labelFa: 'انجمن‌ها', hrefs: ['/associations', '/clubs', '/association/membership', '/association/regulations'] },
  { labelFa: 'بازار', hrefs: ['/animals-market', '/shop'] },
  { labelFa: 'خدمات', hrefs: ['/services', '/guides', '/verify', '/parentage-test', '/association/status'] },
  { labelFa: 'همزیست', hrefs: ['/', '/about', '/contact'] },
];

/** Resolve a group's addresses to live sections, keeping the group's order. */
export function liveLinks(hrefs: readonly string[]): ReadonlyArray<{ href: string; label: string }> {
  return hrefs.flatMap((href) => {
    const section = PUBLIC_SECTIONS.find((candidate) => candidate.href === href && candidate.live);
    return section ? [{ href: section.href, label: section.label }] : [];
  });
}
