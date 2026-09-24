'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError, validation } from '../domain/errors.ts';
import {
  assignClubRole,
  cancelClubOwnershipRequest,
  createClub,
  decideClubOwnership,
  decideClubReports,
  decideClubVerification,
  removeClubRole,
  reportClub,
  requestClubOwnership,
  setClubPublication,
  setClubStanding,
  submitClubForVerification,
} from './service.ts';
import {
  applyToClub,
  decideClubMembership,
  leaveClub,
  publishClubRules,
  reevaluateClubMembers,
  saveClubRuleDraft,
  setClubMembershipStanding,
  startClubFeePayment,
} from './enrollment.ts';
import { CLUB_RULE_KINDS, type ClubRuleKind, type ClubRuleNode } from './rules-model.ts';
import { CLUB_MEMBERSHIP_STATUS_FA, type ClubMembershipStatus } from './membership-model.ts';

export interface ClubFormState {
  readonly ok?: boolean;
  readonly message?: string;
  /** Where the browser should continue, when a form opens a next step. */
  readonly redirectTo?: string;
}

/**
 * The environment a form was submitted from. The guard says whether the actor
 * may be there at all; the service then asks what they may do in this one club.
 */
const SURFACES = {
  owner: '/account/clubs',
  assoc: '/assoc/clubs',
  moderation: '/content/clubs',
  public: '/report',
  // Somebody acting for themselves: applying to a club, paying its fee, leaving it.
  member: '/dashboard',
} as const;
export type ClubSurface = keyof typeof SURFACES;

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

async function actorOf(form: FormData) {
  const surface = text(form, 'surface');
  if (!Object.hasOwn(SURFACES, surface)) throw validation('محیط ارسال فرم معتبر نیست.');
  const guard = await guardRoute(SURFACES[surface as ClubSurface]);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

function failure(error: unknown): ClubFormState {
  if (error instanceof AppError) return { ok: false, message: error.message };
  throw error;
}

function refresh(clubId?: string): void {
  revalidatePath('/account/clubs', 'layout');
  revalidatePath('/assoc/clubs', 'layout');
  revalidatePath('/content/clubs', 'layout');
  revalidatePath('/clubs', 'layout');
  revalidatePath('/associations', 'layout');
  if (clubId) revalidatePath('/account/clubs/' + clubId);
}

export async function createClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await createClub(db(), await actorOf(form), {
      displayNameFa: text(form, 'displayNameFa'),
      scope: text(form, 'scope'),
      aboutFa: text(form, 'aboutFa'),
      contactPhone: text(form, 'contactPhone'),
    });
    refresh(club.id);
    return { ok: true, message: 'کلاب «' + club.displayNameFa + '» به‌صورت پیش‌نویس ساخته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function submitClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await submitClubForVerification(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      noteFa: text(form, 'noteFa'),
    });
    refresh(club.id);
    return { ok: true, message: 'کلاب برای بررسی انجمن فرستاده شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubVerificationAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await decideClubVerification(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      outcome: text(form, 'outcome'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(club.id);
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setClubStandingAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await setClubStanding(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(club.id);
    return { ok: true, message: 'وضعیت کلاب ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setClubPublicationAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const club = await setClubPublication(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      publish: text(form, 'publish') === 'true',
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(club.id);
    return { ok: true, message: club.publicStatus === 'PUBLISHED' ? 'صفحه عمومی کلاب منتشر شد.' : 'صفحه عمومی کلاب پنهان شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function assignClubRoleAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await assignClubRole(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      mobile: text(form, 'mobile'),
      role: text(form, 'role'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'نقش در همین کلاب ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function removeClubRoleAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await removeClubRole(db(), await actorOf(form), {
      membershipId: text(form, 'membershipId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'نقش برداشته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function requestClubOwnershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await requestClubOwnership(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      kind: text(form, 'kind'),
      targetMobile: text(form, 'targetMobile'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'درخواست ثبت شد و در انتظار تصمیم انجمن است.' };
  } catch (error) {
    return failure(error);
  }
}

export async function cancelClubOwnershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await cancelClubOwnershipRequest(db(), await actorOf(form), {
      requestId: text(form, 'requestId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'درخواست پس گرفته شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubOwnershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const decided = await decideClubOwnership(db(), await actorOf(form), {
      requestId: text(form, 'requestId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      approve: text(form, 'approve') === 'true',
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(decided.club.id);
    return { ok: true, message: 'تصمیم مالکیت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reportClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await reportClub(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      reason: text(form, 'reason'),
      details: text(form, 'details') || null,
    });
    revalidatePath('/content/clubs', 'layout');
    return { ok: true, message: 'گزارش شما ثبت شد و بررسی می‌شود. نام شما به کلاب گفته نمی‌شود.' };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubReportsAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const result = await decideClubReports(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      decision: text(form, 'decision'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(result.club.id);
    return { ok: true, message: 'تصمیم برای ' + result.decided.toLocaleString('fa-IR') + ' گزارش باز ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

// ── The club's joining rules and its members (PROMPT-013) ────────────────

/**
 * Build an allowlisted rule tree from the editor's fields.
 *
 * The form never sends a tree: it sends which questions were ticked and their
 * few parameters, and the tree is assembled here from the fixed vocabulary. A
 * browser cannot post a shape the club could not have built in the editor, and
 * the validator refuses anything that still slips through.
 */
function treeFromForm(form: FormData): ClubRuleNode {
  const chosen = form
    .getAll('rule')
    .map(String)
    .filter((kind) => (CLUB_RULE_KINDS as readonly string[]).includes(kind)) as ClubRuleKind[];
  const alternatives = new Set(form.getAll('anyOf').map(String));
  const count = (key: string): number | undefined => {
    const raw = Number(text(form, key));
    return Number.isInteger(raw) && raw > 0 ? raw : undefined;
  };

  const leafOf = (kind: ClubRuleKind): ClubRuleNode => {
    switch (kind) {
      case 'OWNS_DOG': {
        const breedId = text(form, 'ownsDogBreed');
        return { type: 'RULE', kind, params: { minCount: count('ownsDogMin') ?? 1, ...(breedId ? { breedId } : {}) } };
      }
      case 'PEDIGREE':
        return { type: 'RULE', kind, params: { minCount: count('pedigreeMin') ?? 1 } };
      case 'MICROCHIP':
        return { type: 'RULE', kind, params: { minCount: count('microchipMin') ?? 1 } };
      case 'VET_STATUS':
        return { type: 'RULE', kind, params: { status: text(form, 'vetStatus') || 'LICENSED' } };
      default:
        return { type: 'RULE', kind };
    }
  };

  const required = chosen.filter((kind) => !alternatives.has(kind)).map(leafOf);
  const optional = chosen.filter((kind) => alternatives.has(kind)).map(leafOf);
  const children: ClubRuleNode[] = [...required];
  // Two or more alternatives make a real choice; one alternative is just a rule.
  if (optional.length >= 2) children.push({ type: 'GROUP', op: 'ANY', children: optional });
  else children.push(...optional);
  if (children.length === 0) children.push({ type: 'RULE', kind: 'ACCOUNT_ACTIVE' });
  return { type: 'GROUP', op: 'ALL', children };
}

export async function saveClubRulesAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await saveClubRuleDraft(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      tree: treeFromForm(form),
      termsFa: text(form, 'termsFa'),
      termsVersion: text(form, 'termsVersion'),
      feeToman: text(form, 'feeToman'),
      membershipDays: text(form, 'membershipDays'),
      noteFa: text(form, 'noteFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'پیش‌نویس شرایط ذخیره شد؛ تا انتشار، درخواست‌ها با نسخه پیشین سنجیده می‌شوند.' };
  } catch (error) {
    return failure(error);
  }
}

export async function publishClubRulesAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const published = await publishClubRules(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      ruleVersionId: text(form, 'ruleVersionId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'نسخه ' + published.versionNumber.toLocaleString('fa-IR') + ' شرایط منتشر شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function reevaluateClubMembersAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const result = await reevaluateClubMembers(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    const fa = (value: number): string => value.toLocaleString('fa-IR');
    return {
      ok: true,
      message:
        'بازبینی انجام شد: ' + fa(result.examined) + ' عضو بررسی شد و ' + fa(result.nowIneligible) + ' نفر دیگر شرایط را ندارند.',
    };
  } catch (error) {
    return failure(error);
  }
}

export async function applyToClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const membership = await applyToClub(db(), await actorOf(form), {
      clubId: text(form, 'clubId'),
      acceptTermsVersion: text(form, 'acceptTermsVersion') || null,
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: CLUB_MEMBERSHIP_STATUS_FA[membership.status as ClubMembershipStatus] };
  } catch (error) {
    return failure(error);
  }
}

export async function decideClubMembershipAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await decideClubMembership(db(), await actorOf(form), {
      membershipId: text(form, 'membershipId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      approve: text(form, 'approve') === 'true',
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'تصمیم ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function setClubMembershipStandingAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await setClubMembershipStanding(db(), await actorOf(form), {
      membershipId: text(form, 'membershipId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
      to: text(form, 'to') === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE',
      reasonFa: text(form, 'reasonFa'),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'وضعیت عضویت ثبت شد.' };
  } catch (error) {
    return failure(error);
  }
}

export async function leaveClubAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    await leaveClub(db(), await actorOf(form), {
      membershipId: text(form, 'membershipId'),
      expectedVersion: Number(text(form, 'expectedVersion')),
    });
    refresh(text(form, 'clubId'));
    return { ok: true, message: 'از این کلاب خارج شدید.' };
  } catch (error) {
    return failure(error);
  }
}

/** Opens the checkout for the club's joining fee and says where to continue. */
export async function startClubFeeAction(_previous: ClubFormState, form: FormData): Promise<ClubFormState> {
  try {
    const started = await startClubFeePayment(db(), await actorOf(form), { membershipId: text(form, 'membershipId') });
    refresh(text(form, 'clubId'));
    return {
      ok: true,
      message: 'حق عضویت این کلاب ' + Number(started.amountToman).toLocaleString('fa-IR') + ' تومان است.',
      redirectTo: '/payments/' + started.batchId,
    };
  } catch (error) {
    return failure(error);
  }
}
