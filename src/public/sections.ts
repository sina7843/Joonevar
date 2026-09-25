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
