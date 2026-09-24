/**
 * Club rules that need no database — Phase 2.5 §8 (PROMPT-012).
 *
 * A club is the same record as an association (one `community` row, one profile,
 * one set of events and posts); what this file adds is the club's own life: the
 * states it moves through, who may move it, and what each club-scoped role may
 * do *inside that one club*.
 */
export const CLUB_LIFECYCLE = [
  'DRAFT',
  'PENDING_VERIFICATION',
  'NEEDS_CORRECTION',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type ClubLifecycle = (typeof CLUB_LIFECYCLE)[number];

export const CLUB_LIFECYCLE_FA: Record<ClubLifecycle, string> = {
  DRAFT: 'پیش‌نویس',
  PENDING_VERIFICATION: 'در انتظار بررسی',
  NEEDS_CORRECTION: 'نیازمند اصلاح',
  ACTIVE: 'فعال و تأییدشده',
  SUSPENDED: 'تعلیق‌شده',
  REJECTED: 'ردشده',
  ARCHIVED: 'بایگانی‌شده',
};

export const CLUB_ROLES = ['OWNER', 'ADMIN', 'MODERATOR', 'MEMBER'] as const;
export type ClubRole = (typeof CLUB_ROLES)[number];

export const CLUB_ROLE_FA: Record<ClubRole, string> = {
  OWNER: 'مالک',
  ADMIN: 'مدیر',
  MODERATOR: 'ناظر',
  MEMBER: 'عضو',
};

/**
 * Who is acting. `SYSTEM` is the association operator or the superadmin: the
 * authority that verifies a club and decides a privileged ownership change
 * (DEC-0198). It is not a club role and is never stored on a club.
 */
export type ClubActorRole = ClubRole | 'SYSTEM';

/**
 * What somebody may do inside one club. A capability is always asked about one
 * club: holding ADMIN in club A says nothing about club B, because the answer
 * is looked up with that club's id every time.
 */
export const CLUB_CAPABILITIES = [
  /** Read the club's management shell. */
  'VIEW',
  /** Edit the profile the public will read. */
  'PROFILE',
  /** Ask the association to verify the club, or answer a correction request. */
  'SUBMIT',
  /** Write and publish the club's own joining rules (PROMPT-013). */
  'RULES',
  /** Publish or hide the club's own page. */
  'PUBLISH',
  'ASSIGN_ADMIN',
  'ASSIGN_MODERATOR',
  'ASSIGN_MEMBER',
  /** Handle the club's own posts and members' behaviour. */
  'MODERATE',
  /** Hand the club to somebody else. */
  'TRANSFER',
  /** Close the club down. */
  'ARCHIVE',
  /** Verify, suspend, reinstate, or decide an ownership request. */
  'AUTHORITY',
] as const;
export type ClubCapability = (typeof CLUB_CAPABILITIES)[number];

const NOBODY: readonly ClubCapability[] = [];

const BY_ROLE: Record<ClubActorRole, readonly ClubCapability[]> = {
  OWNER: ['VIEW', 'PROFILE', 'SUBMIT', 'RULES', 'PUBLISH', 'ASSIGN_ADMIN', 'ASSIGN_MODERATOR', 'ASSIGN_MEMBER', 'MODERATE', 'TRANSFER', 'ARCHIVE'],
  ADMIN: ['VIEW', 'PROFILE', 'SUBMIT', 'RULES', 'PUBLISH', 'ASSIGN_MODERATOR', 'ASSIGN_MEMBER', 'MODERATE'],
  MODERATOR: ['VIEW', 'MODERATE'],
  MEMBER: ['VIEW'],
  // The association verifies and disciplines a club; it does not run it. Editing
  // somebody else's profile or handing their club around is not an authority act.
  SYSTEM: ['VIEW', 'PUBLISH', 'MODERATE', 'AUTHORITY'],
};

export const clubRoleAllows = (role: ClubActorRole | null, capability: ClubCapability): boolean =>
  role !== null && (BY_ROLE[role] ?? NOBODY).includes(capability);

export const clubCapabilitiesOf = (role: ClubActorRole | null): readonly ClubCapability[] =>
  role === null ? NOBODY : (BY_ROLE[role] ?? NOBODY);

/** Roles one role may hand out. Nobody hands out OWNER: that is an ownership decision. */
export function assignableClubRoles(role: ClubActorRole | null): readonly ClubRole[] {
  const out: ClubRole[] = [];
  if (clubRoleAllows(role, 'ASSIGN_ADMIN')) out.push('ADMIN');
  if (clubRoleAllows(role, 'ASSIGN_MODERATOR')) out.push('MODERATOR');
  if (clubRoleAllows(role, 'ASSIGN_MEMBER')) out.push('MEMBER');
  return out;
}

/**
 * The moves a club may make, and who may make them. Everything absent from this
 * table is refused — including anything out of ARCHIVED, which is the end of the
 * record's public life, and out of REJECTED, which only the archive follows.
 */
const MOVES: ReadonlyArray<{ from: ClubLifecycle; to: ClubLifecycle; by: 'CLUB' | 'AUTHORITY' }> = [
  { from: 'DRAFT', to: 'PENDING_VERIFICATION', by: 'CLUB' },
  { from: 'DRAFT', to: 'ARCHIVED', by: 'CLUB' },
  { from: 'NEEDS_CORRECTION', to: 'PENDING_VERIFICATION', by: 'CLUB' },
  { from: 'NEEDS_CORRECTION', to: 'ARCHIVED', by: 'CLUB' },
  { from: 'PENDING_VERIFICATION', to: 'ACTIVE', by: 'AUTHORITY' },
  { from: 'PENDING_VERIFICATION', to: 'NEEDS_CORRECTION', by: 'AUTHORITY' },
  { from: 'PENDING_VERIFICATION', to: 'REJECTED', by: 'AUTHORITY' },
  { from: 'ACTIVE', to: 'SUSPENDED', by: 'AUTHORITY' },
  { from: 'ACTIVE', to: 'ARCHIVED', by: 'CLUB' },
  { from: 'SUSPENDED', to: 'ACTIVE', by: 'AUTHORITY' },
  { from: 'SUSPENDED', to: 'ARCHIVED', by: 'AUTHORITY' },
  { from: 'REJECTED', to: 'ARCHIVED', by: 'AUTHORITY' },
];

export const isClubLifecycle = (value: unknown): value is ClubLifecycle =>
  typeof value === 'string' && (CLUB_LIFECYCLE as readonly string[]).includes(value);

export const isClubRole = (value: unknown): value is ClubRole =>
  typeof value === 'string' && (CLUB_ROLES as readonly string[]).includes(value);

/** The move, or null when this actor may not make it from here. */
export function clubLifecycleMove(
  from: ClubLifecycle,
  to: ClubLifecycle,
  role: ClubActorRole | null,
): { from: ClubLifecycle; to: ClubLifecycle; by: 'CLUB' | 'AUTHORITY' } | null {
  const move = MOVES.find((candidate) => candidate.from === from && candidate.to === to);
  if (!move) return null;
  if (move.by === 'AUTHORITY') return clubRoleAllows(role, 'AUTHORITY') ? move : null;
  // A club move is made by the club itself — its owner, or an admin for the
  // submission — and by the authority only where the table also allows it.
  if (to === 'ARCHIVED') return clubRoleAllows(role, 'ARCHIVE') || clubRoleAllows(role, 'AUTHORITY') ? move : null;
  return clubRoleAllows(role, 'SUBMIT') ? move : null;
}

/** Everything the public may not see, said plainly to whoever is waiting for it. */
export const CLUB_NOT_PUBLIC_FA: Record<Exclude<ClubLifecycle, 'ACTIVE'>, string> = {
  DRAFT: 'این کلاب هنوز برای بررسی فرستاده نشده و صفحه عمومی ندارد.',
  PENDING_VERIFICATION: 'این کلاب در انتظار بررسی انجمن است و تا تأیید، عمومی نمی‌شود.',
  NEEDS_CORRECTION: 'انجمن اصلاحاتی خواسته است؛ تا ارسال دوباره و تأیید، صفحه عمومی ندارد.',
  SUSPENDED: 'این کلاب تعلیق شده است و صفحه عمومی آن در دسترس نیست.',
  REJECTED: 'درخواست تأیید این کلاب رد شده است.',
  ARCHIVED: 'این کلاب بایگانی شده است.',
};

/**
 * Only a verified, active club is public — and only while it is also published
 * and not hidden by moderation. Verification and publication are two separate
 * questions and neither implies the other.
 */
export const clubIsPublic = (club: {
  lifecycle: string;
  publicStatus: string;
  hiddenByReview?: boolean;
}): boolean => club.lifecycle === 'ACTIVE' && club.publicStatus === 'PUBLISHED';

/** What a club has to carry before the association is asked to look at it. */
export function clubSubmissionBlockers(input: { aboutFa: string | null; contact: string | null; ownedByAccount: boolean }): string[] {
  const problems: string[] = [];
  if ((input.aboutFa ?? '').trim() === '') problems.push('پیش از ارسال برای بررسی، معرفی کلاب را بنویسید.');
  if ((input.contact ?? '').trim() === '') problems.push('پیش از ارسال برای بررسی، یک راه ارتباطی ثبت کنید.');
  if (!input.ownedByAccount) problems.push('این کلاب مالک ندارد؛ نخست مالکیت آن روشن شود.');
  return problems;
}

export const CLUB_OWNERSHIP_KINDS = ['CLAIM', 'TRANSFER'] as const;
export type ClubOwnershipKind = (typeof CLUB_OWNERSHIP_KINDS)[number];

export const CLUB_OWNERSHIP_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ClubOwnershipStatus = (typeof CLUB_OWNERSHIP_STATUSES)[number];

export const CLUB_OWNERSHIP_KIND_FA: Record<ClubOwnershipKind, string> = {
  CLAIM: 'درخواست مالکیت',
  TRANSFER: 'واگذاری مالکیت',
};

export const CLUB_OWNERSHIP_STATUS_FA: Record<ClubOwnershipStatus, string> = {
  PENDING: 'در انتظار تصمیم انجمن',
  APPROVED: 'تأییدشده',
  REJECTED: 'ردشده',
  CANCELLED: 'پس‌گرفته‌شده',
};

export const isClubOwnershipKind = (value: unknown): value is ClubOwnershipKind =>
  typeof value === 'string' && (CLUB_OWNERSHIP_KINDS as readonly string[]).includes(value);
