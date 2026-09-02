/**
 * Actor context — §4.
 *
 * Authorization always answers two questions together: may this actor perform
 * this action, and does this specific record belong to it. Callers pass an
 * Actor; nothing in the services reads a session directly, which keeps the same
 * rules testable without HTTP.
 */
import type { AccountId } from '../domain/ids.ts';
import { forbidden, unauthenticated } from '../domain/errors.ts';

export const ACTOR_CONTEXTS = [
  'USER',
  'BREEDER',
  'TRUSTED_VET',
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
] as const;
export type ActorContextName = (typeof ACTOR_CONTEXTS)[number];

export const ACCOUNT_ROLES = [
  'BREEDER',
  'TRUSTED_VET',
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
] as const;
export type AccountRoleName = (typeof ACCOUNT_ROLES)[number];

/** Contexts that live in their own operational shell and never appear in the public Role Switcher (D10, D11). */
export const OPERATIONAL_CONTEXTS: readonly ActorContextName[] = [
  'ASSOCIATION_OPERATOR',
  'GENETICS_OPERATOR',
  'SUPERADMIN',
];

export interface Actor {
  readonly accountId: AccountId;
  /** The context the actor is currently acting in — exactly one. */
  readonly context: ActorContextName;
  /** Every role active on the account, used to decide which contexts may be entered. */
  readonly activeRoles: readonly AccountRoleName[];
}

export const ANONYMOUS = null;
export type MaybeActor = Actor | null;

export function requireActor(actor: MaybeActor): Actor {
  if (actor === null) throw unauthenticated();
  return actor;
}

/**
 * Contexts the Role Switcher may offer. USER is always present; the others only
 * when the role is actually active. Operational shells are never listed here.
 */
export function switchableContexts(activeRoles: readonly AccountRoleName[]): readonly ActorContextName[] {
  const contexts: ActorContextName[] = ['USER'];
  if (activeRoles.includes('BREEDER')) contexts.push('BREEDER');
  if (activeRoles.includes('TRUSTED_VET')) contexts.push('TRUSTED_VET');
  return contexts;
}

/** Entering a context requires the matching active role; USER needs none. */
export function canEnterContext(activeRoles: readonly AccountRoleName[], context: ActorContextName): boolean {
  if (context === 'USER') return true;
  return activeRoles.includes(context as AccountRoleName);
}

/** Denial message for a route the actor's current context may not enter. */
export function forbiddenContext(context: ActorContextName, pathname: string) {
  return forbidden('Context ' + context + ' may not access ' + pathname);
}

export function assertContext(actor: Actor, allowed: readonly ActorContextName[]): Actor {
  if (!allowed.includes(actor.context)) {
    throw forbidden('This action is not available in the ' + actor.context + ' context');
  }
  return actor;
}

/** Ownership check used by every record-scoped read and write. */
export function assertOwns(actor: Actor, ownerAccountId: AccountId | string): Actor {
  if (actor.accountId !== ownerAccountId) throw forbidden();
  return actor;
}
