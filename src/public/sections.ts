/**
 * The public site's sections, in the order of Requirements-Phase-2 §4.
 *
 * A section is linked from the header, footer and sitemap only once its prompt
 * has built it (`live`). Until then it is listed here so the order stays the
 * source's order, but nothing links to it: a link to a page that does not exist
 * yet is a dead end, not navigation (DEC-0149). `tests/ui/seo.test.ts` holds
 * every live section to a public route rule and every planned one to a closed
 * route, so the flag cannot drift from the access map.
 */
export interface PublicSection {
  readonly href: string;
  readonly label: string;
  readonly live: boolean;
  /** The Phase 2 prompt that builds it. */
  readonly prompt: string;
}

export const PUBLIC_SECTIONS: readonly PublicSection[] = [
  { href: '/', label: 'خانه', live: true, prompt: '002' },
  { href: '/veterinarians', label: 'دامپزشکان', live: true, prompt: '006' },
  { href: '/centers', label: 'مراکز دامپزشکی', live: true, prompt: '008' },
  { href: '/breeds', label: 'نژادهای سگ', live: true, prompt: '003' },
  { href: '/articles', label: 'آموزش‌ها', live: true, prompt: '004' },
  { href: '/news', label: 'اخبار', live: true, prompt: '004' },
  { href: '/associations', label: 'انجمن‌ها و کلاب‌ها', live: true, prompt: '010' },
  { href: '/verify', label: 'استعلام اصالت', live: true, prompt: '014' },
  { href: '/about', label: 'درباره همزیست', live: true, prompt: '002' },
];

export function liveSections(): readonly PublicSection[] {
  return PUBLIC_SECTIONS.filter((section) => section.live);
}
