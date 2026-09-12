/**
 * Resume context — §8 and §23.4.
 *
 * Every asynchronous hop (payment return, OTP re-login, notification tap,
 * going away to register a missing parent) must come back to the same case at
 * the same step, not to a generic list. A resume context is therefore carried
 * on requests, drafts and notifications rather than reconstructed from a URL.
 */
import { validation } from './errors.ts';

export type EntityType =
  | 'ACCOUNT'
  | 'ANIMAL'
  | 'KYC_CASE'
  | 'MEMBERSHIP'
  | 'VET_VISIT_REQUEST'
  | 'SAMPLE'
  | 'DOCUMENT'
  | 'GENETICS_RECEIPT'
  | 'PARENTAGE_RESULT'
  | 'PARENTAGE_APPEAL'
  | 'FOREIGN_PEDIGREE_CASE'
  | 'KENNEL'
  | 'MATING_CASE'
  | 'MATING_DATE_DECLARATION'
  | 'PREGNANCY_DECLARATION'
  | 'BIRTH_EVENT'
  | 'LITTER'
  | 'PUPPY'
  | 'ALLOCATION'
  | 'PAYMENT_BATCH'
  | 'PERSONAL_DECLARATION'
  | 'POSTAL_REQUEST'
  | 'PRODUCT_SETTING'
  | 'CONTENT_ITEM'
  | 'VET_APPLICATION'
  | 'CENTRE'
  | 'CENTRE_MEMBER'
  | 'DIRECTORY_SUGGESTION'
  | 'CENTRE_CLAIM'
  | 'COMMUNITY'
  | 'COMMUNITY_MANAGER'
  | 'AD_SUBSCRIPTION';

export interface EntityRef {
  readonly type: EntityType;
  readonly id: string;
}

export interface ResumeContext {
  /** The record the actor must return to. */
  readonly entity: EntityRef;
  /** The workflow step inside that record, so the case reopens where it stopped. */
  readonly step: string;
  /** Concrete route. Never a bare list route. */
  readonly originRoute: string;
  /** Small, non-sensitive selections that must survive the round trip. */
  readonly selection?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
}

/**
 * A relative path, optionally with a query string, and never protocol-relative.
 * A step inside a form is a legitimate part of the return address, so `?step=6`
 * has to survive; an absolute or `//host` target must not.
 */
const ROUTE = /^\/(?!\/)[^\s#]*$/;

export function resumeContext(input: ResumeContext): ResumeContext {
  if (!input.entity?.type || !input.entity?.id) throw validation('Resume context requires an entity reference');
  if (!input.step.trim()) throw validation('Resume context requires a step');
  if (!ROUTE.test(input.originRoute)) throw validation('Resume context requires a relative origin route');
  // A list route defeats the purpose, checked below on the path alone.
  // §8 requires reopening the same case and step, so a bare list is refused.
  const path = input.originRoute.split('?')[0];
  if (path === '/' || path === '/dashboard') {
    throw validation('Resume context must point at the case, not the dashboard');
  }
  return input;
}

export function parseResumeContext(raw: unknown): ResumeContext {
  if (typeof raw !== 'object' || raw === null) throw validation('Invalid resume context');
  return resumeContext(raw as ResumeContext);
}

export const sameEntity = (a: EntityRef, b: EntityRef): boolean => a.type === b.type && a.id === b.id;
