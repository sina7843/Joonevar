/**
 * Rule-based compatibility — PHASE-4 PROMPT-004.
 *
 * Deterministic and explainable: the same facts always give the same score and
 * every point of it has a sentence. No learning, no weights anybody tuned in
 * the dark, no medical claim. Subscription is not an input — it decides who may
 * look, never who is ranked higher (PRODUCT_DECISIONS §7).
 *
 * Blockers close the request (and set the score to 0); warnings do not.
 * Kinship and cooldown warn unless the active breed rule says BLOCK; age
 * outside the range, or a range nobody has set, blocks (DEC-0217 §13).
 */
import type { CooldownState, RuleFacts } from './profile-model.ts';
import { ageRequestProblem } from './profile-model.ts';
import type { Kinship } from './kinship.ts';

export const SCORE_DISCLAIMER_FA =
  'این امتیاز فقط تطابق داده‌های ثبت‌شده با قواعد را نشان می‌دهد و تضمین باروری، آبستنی، سلامت یا کیفیت توله نیست.';

export interface SideFacts {
  readonly animalId: string;
  readonly species: string;
  /** The breed after resolving a merged duplicate to the breed it was merged into. */
  readonly breedId: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly ageMonths: number | null;
  readonly rule: (RuleFacts & { readonly kinshipMaxDegree: number | null; readonly kinshipMode: 'WARN' | 'BLOCK' }) | null;
  readonly cooldown: CooldownState;
  readonly confirmedMatings: number;
  readonly completeness: { readonly score: number; readonly total: number };
  readonly hasPedigree: boolean;
}

export interface Preferences {
  readonly maxDistanceKm: number | null;
  readonly pedigreeRequired: boolean;
}

export interface Evaluation {
  readonly score: number;
  readonly positives: readonly string[];
  readonly warnings: readonly string[];
  readonly unknowns: readonly string[];
  readonly blockers: readonly string[];
  /** The rule versions this answer was computed from, for the record that stores it (PROMPT-005). */
  readonly ruleVersions: readonly { readonly id: string; readonly version: number }[];
  readonly disclaimerFa: string;
}

export function evaluateCompatibility(input: {
  readonly mine: SideFacts;
  readonly other: SideFacts;
  readonly kinship: Kinship;
  readonly distanceKm: number | null;
  readonly preferences: Preferences;
}): Evaluation {
  const { mine, other, kinship, distanceKm, preferences } = input;
  const positives: string[] = [];
  const warnings: string[] = [];
  const unknowns: string[] = [];
  const blockers: string[] = [];
  let score = 40;

  // ── structure: the finder never pairs these ──
  if (mine.animalId === other.animalId || kinship.status === 'SELF') blockers.push('یک حیوان با خودش جفت نمی‌شود.');
  if (mine.species !== other.species) blockers.push('دو حیوان از یک گونه نیستند.');
  if (mine.breedId === null || other.breedId === null || mine.breedId !== other.breedId) blockers.push('جفت‌یابی فقط میان حیوانات هم‌نژاد است.');
  else positives.push('هم‌نژاد');
  if (mine.sex === null || other.sex === null || mine.sex === other.sex) blockers.push('جفت‌یابی فقط میان نر و ماده است.');
  else positives.push('جنس مخالف');

  // ── age, from each animal's own active rule ──
  let agesOk = true;
  for (const [side, label] of [
    [mine, 'حیوان شما'],
    [other, 'حیوان مقابل'],
  ] as const) {
    const problem = side.ageMonths === null ? 'تاریخ تولد ثبت نشده است.' : ageRequestProblem(side.rule, side.ageMonths);
    if (problem) {
      blockers.push(label + ': ' + problem);
      agesOk = false;
    }
  }
  if (agesOk) {
    positives.push('سن هر دو در بازه مجاز نژاد');
    score += 10;
  }

  // ── lineage ──
  const kinRule = mine.rule;
  if (kinship.status === 'KNOWN_RELATED') {
    const applies = kinRule?.kinshipMaxDegree === null || kinRule?.kinshipMaxDegree === undefined || (kinship.degree ?? 99) <= kinRule.kinshipMaxDegree;
    if (applies && kinRule?.kinshipMode === 'BLOCK') blockers.push('خویشاوندی: ' + kinship.explanationFa + ' قاعده این نژاد آن را مانع می‌داند.');
    else {
      warnings.push('خویشاوندی: ' + kinship.explanationFa);
      score -= 25;
    }
  } else if (kinship.status === 'UNKNOWN') {
    unknowns.push(kinship.explanationFa);
  } else if (kinship.status === 'NONE_FOUND') {
    positives.push(kinship.explanationFa);
    score += 10;
  }

  // ── cooldown: warning unless the rule blocks ──
  for (const [side, label] of [
    [mine, 'حیوان شما'],
    [other, 'حیوان مقابل'],
  ] as const) {
    if (side.cooldown.state === 'IN_COOLDOWN') {
      if (side.cooldown.mode === 'BLOCK') blockers.push(label + ': ' + side.cooldown.fa);
      else {
        warnings.push(label + ': ' + side.cooldown.fa);
        score -= 10;
      }
    } else if (side.cooldown.state === 'NOT_CONFIGURED') unknowns.push(label + ': ' + side.cooldown.fa);
  }

  // ── distance ──
  if (distanceKm === null) unknowns.push('فاصله قابل محاسبه نیست؛ مختصات یکی از دو طرف ثبت نشده است.');
  else if (preferences.maxDistanceKm !== null && distanceKm > preferences.maxDistanceKm) {
    warnings.push('فاصله تقریبی ' + distanceKm.toLocaleString('fa-IR') + ' کیلومتر، بیشتر از ترجیح شما');
  } else if (distanceKm <= 50) {
    positives.push('فاصله تقریبی کمتر از ۵۰ کیلومتر');
    score += 10;
  } else if (distanceKm <= 200) {
    positives.push('فاصله تقریبی کمتر از ۲۰۰ کیلومتر');
    score += 5;
  }

  // ── recorded history, pedigree and completeness: data quality, not animal quality ──
  if (other.confirmedMatings > 0) {
    positives.push('سابقه جفت‌گیری تأییدشده دارد');
    score += 5;
  }
  if (mine.hasPedigree && other.hasPedigree) {
    positives.push('هر دو شجره‌نامه دارند');
    score += 5;
  } else if (preferences.pedigreeRequired && !other.hasPedigree) warnings.push('حیوان مقابل شجره‌نامه ندارد، برخلاف ترجیح شما');
  score += other.completeness.score * 2;

  const ruleVersions = [mine.rule, other.rule]
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ id: r.id, version: r.version }));
  return {
    score: blockers.length > 0 ? 0 : Math.max(0, Math.min(100, score)),
    positives,
    warnings,
    unknowns,
    blockers,
    ruleVersions: ruleVersions.filter((r, i) => ruleVersions.findIndex((x) => x.id === r.id) === i),
    disclaimerFa: SCORE_DISCLAIMER_FA,
  };
}

/** Rounded up to 5 km and never below 5: an exact distance can triangulate a home. */
export function roundedDistanceKm(km: number): number {
  return Math.max(5, Math.ceil(km / 5) * 5);
}
