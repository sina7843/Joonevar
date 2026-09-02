/**
 * The cooldown warning — §17.2, D06.
 *
 * The rule is advisory in the strongest sense: it is computed only from dates
 * both sides actually confirmed, it never blocks or hides the continue action,
 * and with no confirmed history it produces nothing at all rather than inventing
 * a base date. The arithmetic itself lives in the product calendar, where six
 * months are six calendar months and never a substituted day count.
 */
import { and, desc, eq, or } from 'drizzle-orm';
import type { DbClient } from '../db/client.ts';
import { animals } from '../db/schema/animals.ts';
import { matingDateDeclarations, matingPermits } from '../db/schema/mating.ts';
import { recordAudit } from '../audit/service.ts';
import {
  cooldownWindow,
  formatCivilDateFa,
  todayCivil,
  type AnimalSex,
  type CivilDate,
  type CooldownPolicy,
} from '../domain/calendar.ts';
import { readInt } from '../settings/service.ts';
import type { Actor } from '../authz/actor.ts';

export interface CooldownNotice {
  readonly animalId: string;
  readonly animalName: string | null;
  readonly sex: AnimalSex;
  readonly baseDate: CivilDate;
  readonly endsOn: CivilDate;
  /** Names the sex, the base date and the end of the window (§17.2). */
  readonly messageFa: string;
}

export interface CooldownAdvisory {
  readonly hasWarning: boolean;
  readonly notices: readonly CooldownNotice[];
  readonly messageFa: string | null;
  /** Always true: §17.2 forbids removing or locking the continue action. */
  readonly canContinue: true;
}

export const NO_WARNING: CooldownAdvisory = {
  hasWarning: false,
  notices: [],
  messageFa: null,
  canContinue: true,
};

/** The explanation shown wherever no warning could be computed (§17.2). */
export const NO_BASIS_NOTE_FA =
  'محاسبه فاصله زمانی فقط بر پایه تاریخ‌های جفت‌گیری تأییدشده دوطرفه انجام می‌شود؛ تا ثبت چنین تاریخی، هیچ تاریخ فرضی ساخته نمی‌شود و هشداری محاسبه نمی‌گردد.';

export async function cooldownPolicy(database: DbClient): Promise<CooldownPolicy> {
  const [maleDays, femaleMonths] = await Promise.all([
    readInt(database, 'cooldown.male_days'),
    readInt(database, 'cooldown.female_months'),
  ]);
  return { maleDays, femaleMonths };
}

/**
 * The latest mutually confirmed mating date of one animal — §17.1, §17.3.
 *
 * Only official CONFIRMED declarations count, across every permit the animal is
 * part of. A personal, unconfirmed record never reaches this query.
 */
export async function latestConfirmedDateOfAnimal(
  database: DbClient,
  animalId: string,
): Promise<CivilDate | null> {
  const [row] = await database
    .select({ matedOn: matingDateDeclarations.matedOn })
    .from(matingDateDeclarations)
    .innerJoin(matingPermits, eq(matingPermits.id, matingDateDeclarations.permitId))
    .where(
      and(
        eq(matingDateDeclarations.status, 'CONFIRMED'),
        or(eq(matingPermits.sireAnimalId, animalId), eq(matingPermits.damAnimalId, animalId)),
      ),
    )
    .orderBy(desc(matingDateDeclarations.matedOn))
    .limit(1);
  return row?.matedOn ?? null;
}

const SEX_FA: Record<AnimalSex, string> = { MALE: 'نر', FEMALE: 'ماده' };

async function noticeFor(
  database: DbClient,
  animalId: string,
  policy: CooldownPolicy,
  today: CivilDate,
): Promise<CooldownNotice | null> {
  const [animal] = await database
    .select({ id: animals.id, name: animals.name, sex: animals.sex })
    .from(animals)
    .where(eq(animals.id, animalId))
    .limit(1);
  if (!animal || (animal.sex !== 'MALE' && animal.sex !== 'FEMALE')) return null;

  const basis = await latestConfirmedDateOfAnimal(database, animalId);
  const window = cooldownWindow(animal.sex, basis, today, policy);
  if (!window || !window.inWindow) return null;

  return {
    animalId: animal.id,
    animalName: animal.name,
    sex: animal.sex,
    baseDate: window.baseDate,
    endsOn: window.endsOn,
    messageFa:
      'حیوان ' +
      SEX_FA[animal.sex] +
      ' «' +
      (animal.name ?? 'بدون نام') +
      '» از تاریخ ' +
      formatCivilDateFa(window.baseDate) +
      ' تا ' +
      formatCivilDateFa(window.endsOn) +
      ' در بازه فاصله زمانی است.',
  };
}

/**
 * The advisory for a set of animals — the same computation at every permit
 * entry, so the warning never depends on which screen it is read from.
 */
export async function cooldownAdvisoryForAnimals(
  database: DbClient,
  animalIds: readonly string[],
  today: CivilDate = todayCivil(),
): Promise<CooldownAdvisory> {
  const policy = await cooldownPolicy(database);
  const notices: CooldownNotice[] = [];
  for (const animalId of animalIds) {
    const notice = await noticeFor(database, animalId, policy, today);
    if (notice) notices.push(notice);
  }
  if (notices.length === 0) return NO_WARNING;
  return {
    hasWarning: true,
    notices,
    messageFa: notices.map((n) => n.messageFa).join(' ') + ' این هشدار مانع ادامه مسیر نیست.',
    canContinue: true,
  };
}

/**
 * Records that a warning was shown and the person continued anyway (§17.2).
 *
 * Called at the moment of the action, not on render, so the log says what was
 * actually done rather than what was merely displayed.
 */
export async function recordCooldownContinuation(
  tx: DbClient,
  actor: Actor,
  advisory: CooldownAdvisory,
  target: { type: string; id: string; step: string },
): Promise<void> {
  if (!advisory.hasWarning) return;
  await recordAudit(tx, actor, {
    action: 'MATING_COOLDOWN_CONTINUED',
    targetType: target.type,
    targetId: target.id,
    reason: advisory.messageFa,
    after: {
      step: target.step,
      warned: true,
      continued: true,
      notices: advisory.notices.map((n) => ({
        animalId: n.animalId,
        sex: n.sex,
        baseDate: n.baseDate,
        endsOn: n.endsOn,
      })),
    },
  });
}
