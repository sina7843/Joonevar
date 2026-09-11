/**
 * Route access map — §4, D10, D11.
 *
 * Hiding a link is not access control. Every guarded route is listed here and
 * checked on the server before anything is rendered, so editing a URL cannot
 * reach a context the account does not hold.
 *
 * Operational shells are separate routes, never a promotion of a public
 * account, and they are matched most-specific-first.
 */
import { canEnterContext, forbiddenContext, type Actor, type ActorContextName, type MaybeActor } from './actor.ts';
import { unauthenticated } from '../domain/errors.ts';

export type RouteAccess = 'PUBLIC' | readonly ActorContextName[];

const PUBLIC_APP: readonly ActorContextName[] = ['USER', 'BREEDER', 'TRUSTED_VET'];

/** Longest prefix wins, so `/breeder/activate` is matched before `/breeder`. */
const RULES: ReadonlyArray<{ prefix: string; access: RouteAccess }> = [
  { prefix: '/', access: 'PUBLIC' },
  { prefix: '/login', access: 'PUBLIC' },
  { prefix: '/api/health', access: 'PUBLIC' },

  // Public site (Phase 2, DEC-0149). A section opens here when its prompt builds
  // it; until then its reserved prefix stays unlisted and therefore closed.
  { prefix: '/about', access: 'PUBLIC' },
  { prefix: '/breeds', access: 'PUBLIC' },
  { prefix: '/articles', access: 'PUBLIC' },
  { prefix: '/news', access: 'PUBLIC' },
  { prefix: '/announcements', access: 'PUBLIC' },
  // Content images: the route itself serves only images of visible content (DEC-0160).
  { prefix: '/media', access: 'PUBLIC' },
  { prefix: '/robots.txt', access: 'PUBLIC' },
  { prefix: '/sitemap.xml', access: 'PUBLIC' },
  { prefix: '/sitemaps', access: 'PUBLIC' },

  { prefix: '/dashboard', access: PUBLIC_APP },
  { prefix: '/notifications', access: PUBLIC_APP },
  { prefix: '/profile', access: PUBLIC_APP },
  { prefix: '/account', access: PUBLIC_APP },
  { prefix: '/membership', access: PUBLIC_APP },
  { prefix: '/animals', access: PUBLIC_APP },
  { prefix: '/requests', access: PUBLIC_APP },
  { prefix: '/registration', access: PUBLIC_APP },
  { prefix: '/pedigree', access: PUBLIC_APP },
  { prefix: '/vets', access: PUBLIC_APP },
  { prefix: '/declaration', access: PUBLIC_APP },
  { prefix: '/documents', access: PUBLIC_APP },
  // Reporting content needs a signed-in account; any account may report (§13, DEC-0161).
  { prefix: '/report', access: PUBLIC_APP },

  // Becoming a breeder starts from the ordinary user context.
  { prefix: '/breeder/activate', access: ['USER', 'BREEDER'] },
  { prefix: '/breeder', access: ['BREEDER'] },
  // §15.2: registering a kennel starts in the public context, because the
  // breeder role is what an approved kennel produces — it cannot also be the
  // condition for reaching the form (§15.1).
  { prefix: '/kennels', access: ['USER', 'BREEDER'] },
  { prefix: '/mating', access: ['USER', 'BREEDER'] },
  { prefix: '/puppy-cards', access: ['USER', 'BREEDER'] },
  { prefix: '/litters', access: ['USER', 'BREEDER'] },

  // The trusted vet panel is the assigned-work surface, not a public context.
  { prefix: '/vet', access: ['TRUSTED_VET'] },

  // Operational shells (D11).
  { prefix: '/assoc', access: ['ASSOCIATION_OPERATOR'] },
  { prefix: '/genetics', access: ['GENETICS_OPERATOR'] },
  { prefix: '/admin', access: ['SUPERADMIN'] },

  // Phase 2 content environments (P2-D11, DEC-0158).
  { prefix: '/author', access: ['AUTHOR'] },
  { prefix: '/content', access: ['CONTENT_ADMIN'] },
];

function normalize(pathname: string): string {
  const trimmed = pathname.split('?')[0]!.split('#')[0]!;
  if (trimmed.length > 1 && trimmed.endsWith('/')) return trimmed.slice(0, -1);
  return trimmed === '' ? '/' : trimmed;
}

function matches(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(prefix + '/');
}

export function accessForRoute(pathname: string): RouteAccess {
  const path = normalize(pathname);
  let best: { prefix: string; access: RouteAccess } | null = null;
  for (const rule of RULES) {
    if (!matches(path, rule.prefix)) continue;
    if (best === null || rule.prefix.length > best.prefix.length) best = rule;
  }
  // An unlisted route is closed by default: a new page cannot become publicly
  // reachable just because nobody remembered to add a rule.
  return best?.access ?? [];
}

/** Prefixes of the signed-in application — what robots.txt keeps out of search (DEC-0152). */
export function applicationPrefixes(): string[] {
  return RULES.filter((rule) => rule.access !== 'PUBLIC').map((rule) => rule.prefix);
}

export function canAccessRoute(actor: MaybeActor, pathname: string): boolean {
  const access = accessForRoute(pathname);
  if (access === 'PUBLIC') return true;
  if (actor === null) return false;
  if (!access.includes(actor.context)) return false;
  return canEnterContext(actor.activeRoles, actor.context);
}

/** Server-side gate used by every guarded layout and route handler. */
export function assertRouteAccess(actor: MaybeActor, pathname: string): Actor | null {
  const access = accessForRoute(pathname);
  if (access === 'PUBLIC') return actor;
  if (actor === null) throw unauthenticated();
  if (!access.includes(actor.context) || !canEnterContext(actor.activeRoles, actor.context)) {
    throw forbiddenContext(actor.context, pathname);
  }
  return actor;
}

/**
 * Pick the context this route needs.
 *
 * An operational shell is a separate environment reached by its own URL, not an
 * entry in the public role switcher (D11), so an operator who holds the role
 * enters it by visiting the route — and the same person visiting the public app
 * is back in their ordinary user context. The current context always wins when
 * it is already allowed.
 *
 * This only ever chooses among permissions the account already holds; it never
 * grants one, so an account without the role still gets a denial.
 */
export function selectContext(actor: Actor, allowed: readonly ActorContextName[]): ActorContextName | null {
  if (allowed.includes(actor.context) && canEnterContext(actor.activeRoles, actor.context)) return actor.context;
  for (const context of allowed) {
    if (canEnterContext(actor.activeRoles, context)) return context;
  }
  return null;
}
