/**
 * Account, profile, residence and mobile change — §6.2 and §6.4.
 *
 * Account, KYC, membership, public role and request state are five separate
 * concepts (§4). Nothing in this file couples them: completing a profile does
 * not approve KYC, and approving KYC does not grant membership.
 */
import { and, eq } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { accounts } from '../db/schema/core.ts';
import { kycCases, otpChallenges, profiles, residences } from '../db/schema/identity.ts';
import { recordAudit } from '../audit/service.ts';
import { conflict, forbidden, notFound, validation, versionStale } from '../domain/errors.ts';
import { todayCivil } from '../domain/calendar.ts';
import {
  assertBirthDate,
  assertMobile,
  assertNationalId,
  assertPersonName,
  maskMobile,
  normalizeOptionalDisplayName,
  normalizeOptionalPostalCode,
} from '../domain/identity.ts';
import type { Actor } from '../authz/actor.ts';
import { revokeOtherSessions } from './session.ts';
import { verifyOtp, type VerifyOutcome } from './otp.ts';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const candidate = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = candidate?.code ?? candidate?.cause?.code;
  const name = candidate?.constraint ?? candidate?.cause?.constraint;
  return code === UNIQUE_VIOLATION && (name === undefined || name === constraint);
}

export interface SignInResult {
  readonly accountId: string;
  readonly isNew: boolean;
  readonly status: 'PROFILE_INCOMPLETE' | 'ACTIVE' | 'DISABLED';
}

/**
 * Sign in with an already verified code.
 *
 * A new mobile creates an account in PROFILE_INCOMPLETE (§6.1 step 4). A
 * returning mobile just resolves; nothing about the existing account changes.
 */
export async function signInWithVerifiedMobile(
  database: Database,
  rawMobile: string,
): Promise<SignInResult> {
  const mobile = assertMobile(rawMobile);

  const [existing] = await database
    .select({ id: accounts.id, status: accounts.status })
    .from(accounts)
    .where(eq(accounts.mobile, mobile))
    .limit(1);
  if (existing) {
    if (existing.status === 'DISABLED') throw forbidden('این حساب غیرفعال است.');
    return { accountId: existing.id, isNew: false, status: existing.status };
  }

  try {
    const created = await database.transaction(async (tx) => {
      const [row] = await tx
        .insert(accounts)
        .values({ mobile, status: 'PROFILE_INCOMPLETE' })
        .returning({ id: accounts.id });
      await recordAudit(tx, null, {
        action: 'ACCOUNT_CREATED',
        targetType: 'ACCOUNT',
        targetId: row!.id,
        // The full number is not written to the audit trail.
        after: { mobile: maskMobile(mobile), status: 'PROFILE_INCOMPLETE' },
      });
      return row!.id;
    });
    return { accountId: created, isNew: true, status: 'PROFILE_INCOMPLETE' };
  } catch (error) {
    // Two verified codes for the same new number can land together; the unique
    // index arbitrates and the loser simply resolves the winner's account.
    if (isUniqueViolation(error, 'account_mobile_key')) {
      const [row] = await database
        .select({ id: accounts.id, status: accounts.status })
        .from(accounts)
        .where(eq(accounts.mobile, mobile))
        .limit(1);
      if (row) return { accountId: row.id, isNew: false, status: row.status };
    }
    throw error;
  }
}

export interface ProfileInput {
  readonly firstName: string;
  readonly lastName: string;
  readonly nationalId: string;
  readonly birthDate: string;
  readonly displayName?: string | null;
  readonly displayNameVisible?: boolean;
  readonly expectedVersion?: number;
}

export interface ProfileRecord {
  readonly accountId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly nationalId: string;
  readonly birthDate: string;
  readonly displayName: string | null;
  readonly displayNameVisible: boolean;
  readonly version: number;
}

export async function findProfile(database: DbClient, accountId: string): Promise<ProfileRecord | null> {
  const [row] = await database.select().from(profiles).where(eq(profiles.accountId, accountId)).limit(1);
  return row ? (row as ProfileRecord) : null;
}

async function kycStatusOf(database: DbClient, accountId: string): Promise<string | null> {
  const [row] = await database
    .select({ status: kycCases.status })
    .from(kycCases)
    .where(eq(kycCases.accountId, accountId))
    .limit(1);
  return row?.status ?? null;
}

/**
 * Create or update the identity group.
 *
 * §6.4 is explicit: after KYC, first name, last name and birth date stay
 * directly editable with no support ticket and no second KYC, while the
 * national id becomes read-only. Both halves of that rule are enforced here.
 */
export async function saveProfile(
  database: Database,
  actor: Actor,
  input: ProfileInput,
): Promise<ProfileRecord> {
  const firstName = assertPersonName(input.firstName, 'نام');
  const lastName = assertPersonName(input.lastName, 'نام خانوادگی');
  const nationalId = assertNationalId(input.nationalId);
  const birthDate = assertBirthDate(input.birthDate, todayCivil());
  const displayName = normalizeOptionalDisplayName(input.displayName);
  const displayNameVisible = input.displayNameVisible ?? false;

  try {
    return await database.transaction(async (tx) => {
      const existing = await findProfile(tx, actor.accountId);
      const kyc = await kycStatusOf(tx, actor.accountId);

      if (existing) {
        if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
          throw versionStale(input.expectedVersion, existing.version);
        }
        if (kyc === 'APPROVED' && nationalId !== existing.nationalId) {
          throw forbidden('کد ملی پس از تأیید احراز هویت قابل تغییر نیست.');
        }
        const nextVersion = existing.version + 1;
        const [updated] = await tx
          .update(profiles)
          .set({ firstName, lastName, nationalId, birthDate, displayName, displayNameVisible, version: nextVersion, updatedAt: new Date() })
          .where(and(eq(profiles.accountId, actor.accountId), eq(profiles.version, existing.version)))
          .returning();
        if (!updated) throw conflict('پروفایل هم‌زمان تغییر کرده است.');

        await recordAudit(tx, actor, {
          action: 'PROFILE_UPDATED',
          targetType: 'ACCOUNT',
          targetId: actor.accountId,
          targetVersion: nextVersion,
          // `nationalId` is on the redaction list, so before/after record that
          // it changed without writing the number itself.
          before: { firstName: existing.firstName, lastName: existing.lastName, nationalId: existing.nationalId, birthDate: existing.birthDate, displayName: existing.displayName, displayNameVisible: existing.displayNameVisible },
          after: { firstName, lastName, nationalId, birthDate, displayName, displayNameVisible },
        });
        return updated as ProfileRecord;
      }

      const [created] = await tx
        .insert(profiles)
        .values({ accountId: actor.accountId, firstName, lastName, nationalId, birthDate, displayName, displayNameVisible })
        .returning();

      // The account leaves PROFILE_INCOMPLETE once the identity group is filled.
      // This is not KYC approval and grants nothing on its own.
      await tx
        .update(accounts)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(and(eq(accounts.id, actor.accountId), eq(accounts.status, 'PROFILE_INCOMPLETE')));

      await recordAudit(tx, actor, {
        action: 'PROFILE_CREATED',
        targetType: 'ACCOUNT',
        targetId: actor.accountId,
        targetVersion: 1,
        after: { firstName, lastName, nationalId, birthDate, displayName, displayNameVisible },
      });
      return created as ProfileRecord;
    });
  } catch (error) {
    if (isUniqueViolation(error, 'profile_national_id_key')) {
      throw conflict('این کد ملی قبلاً برای حساب دیگری ثبت شده است.');
    }
    throw error;
  }
}

export interface ResidenceInput {
  readonly province?: string | null;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly postalCode?: string | null;
  readonly geoLat?: string | null;
  readonly geoLng?: string | null;
}

const trimmedOrNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Residence is optional as a whole. Saving it empty is a valid outcome and must
 * not block anything downstream; a postal code that is entered is still
 * validated (§6.2).
 */
export async function saveResidence(database: Database, actor: Actor, input: ResidenceInput) {
  const next = {
    province: trimmedOrNull(input.province),
    city: trimmedOrNull(input.city),
    address: trimmedOrNull(input.address),
    postalCode: normalizeOptionalPostalCode(input.postalCode),
    geoLat: trimmedOrNull(input.geoLat),
    geoLng: trimmedOrNull(input.geoLng),
  };

  return database.transaction(async (tx) => {
    const [existing] = await tx.select().from(residences).where(eq(residences.accountId, actor.accountId)).limit(1);
    if (existing) {
      const [updated] = await tx
        .update(residences)
        .set({ ...next, version: existing.version + 1, updatedAt: new Date() })
        .where(eq(residences.accountId, actor.accountId))
        .returning();
      await recordAudit(tx, actor, {
        action: 'RESIDENCE_UPDATED',
        targetType: 'ACCOUNT',
        targetId: actor.accountId,
        targetVersion: existing.version + 1,
        before: { province: existing.province, city: existing.city, address: existing.address, postalCode: existing.postalCode },
        after: { province: next.province, city: next.city, address: next.address, postalCode: next.postalCode },
      });
      return updated!;
    }
    const [created] = await tx.insert(residences).values({ accountId: actor.accountId, ...next }).returning();
    await recordAudit(tx, actor, {
      action: 'RESIDENCE_CREATED',
      targetType: 'ACCOUNT',
      targetId: actor.accountId,
      targetVersion: 1,
      after: { province: next.province, city: next.city, address: next.address, postalCode: next.postalCode },
    });
    return created!;
  });
}

export async function findResidence(database: DbClient, accountId: string) {
  const [row] = await database.select().from(residences).where(eq(residences.accountId, accountId)).limit(1);
  return row ?? null;
}

/**
 * Confirm a mobile change (§6.4).
 *
 * The current number stays valid until this succeeds. A cancelled or failed
 * attempt changes nothing, and a code issued for signing in cannot be used
 * here because the challenge carries its purpose and its account.
 */
export async function confirmMobileChange(
  database: Database,
  actor: Actor,
  input: { challengeId: string; code: string; sessionId: string },
  now: Date = new Date(),
): Promise<{ outcome: VerifyOutcome; mobile?: string }> {
  const [challenge] = await database
    .select()
    .from(otpChallenges)
    .where(eq(otpChallenges.id, input.challengeId))
    .limit(1);
  if (!challenge) throw notFound('درخواست تغییر شماره پیدا نشد.');
  if (challenge.purpose !== 'MOBILE_CHANGE' || challenge.accountId !== actor.accountId) {
    throw forbidden('این کد برای تغییر شماره این حساب صادر نشده است.');
  }

  const outcome = await verifyOtp(database, { challengeId: input.challengeId, code: input.code }, now);
  if (outcome.state !== 'OTP_VERIFIED') return { outcome };

  const [current] = await database
    .select({ mobile: accounts.mobile })
    .from(accounts)
    .where(eq(accounts.id, actor.accountId))
    .limit(1);
  if (!current) throw notFound('حساب پیدا نشد.');

  try {
    await database.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ mobile: outcome.mobile, updatedAt: now })
        .where(eq(accounts.id, actor.accountId));
      await recordAudit(tx, actor, {
        action: 'ACCOUNT_MOBILE_CHANGED',
        targetType: 'ACCOUNT',
        targetId: actor.accountId,
        before: { mobile: maskMobile(current.mobile) },
        after: { mobile: maskMobile(outcome.mobile) },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error, 'account_mobile_key')) {
      throw conflict('این شماره قبلاً برای حساب دیگری ثبت شده است.');
    }
    throw error;
  }

  // The credential that could mint sessions has moved, so older sessions end.
  await revokeOtherSessions(database, actor.accountId, input.sessionId, now);
  return { outcome, mobile: outcome.mobile };
}

/** Guard used before starting a mobile change, so a taken number fails early. */
export async function assertMobileAvailable(database: DbClient, rawMobile: string, accountId: string) {
  const mobile = assertMobile(rawMobile);
  const [row] = await database.select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, mobile)).limit(1);
  if (row && row.id !== accountId) throw conflict('این شماره قبلاً برای حساب دیگری ثبت شده است.');
  if (row && row.id === accountId) throw validation('این شماره همان شماره فعلی حساب شماست.');
  return mobile;
}
