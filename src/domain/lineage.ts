/**
 * Lineage — §9.3.
 *
 * The generation of a child is `1 + min(generation of sire, generation of dam)`
 * and it is only computed when **both** direct parents resolve to real records.
 * It is read-only everywhere: there is no generation selector, no manual
 * increase, and a value arriving in a request is ignored rather than trusted.
 *
 * Three outcomes are deliberately distinct, because §9.3 treats them
 * differently:
 *  - both parents resolved  → compute;
 *  - a parent genuinely absent → G0 plus a CTA to register that parent;
 *  - a technical lookup failure → keep the draft and the current generation,
 *    report LOOKUP_ERROR and offer a retry. It never silently becomes G0.
 */
import { validation } from './errors.ts';

export type ParentRole = 'SIRE' | 'DAM';

export type ParentResolution =
  | { readonly state: 'RESOLVED'; readonly animalId: string; readonly generation: number }
  /** A code was entered but no Hamzist record carries it, or none was entered at all. */
  | { readonly state: 'NOT_FOUND' }
  /** The lookup itself failed. Not the same as the parent being absent. */
  | { readonly state: 'LOOKUP_ERROR'; readonly detail?: string };

export type GenerationOutcome =
  | { readonly state: 'COMPUTED'; readonly generation: number; readonly origin: 'INTERNAL_G1PLUS' }
  | {
      readonly state: 'PARENT_MISSING';
      readonly generation: 0;
      readonly origin: 'G0';
      readonly missing: readonly ParentRole[];
    }
  | { readonly state: 'LOOKUP_ERROR'; readonly keepGeneration: number };

/**
 * Decide the generation from the two parent resolutions.
 *
 * A technical failure on either side wins over everything else: an unresolved
 * lookup must not be reported as a missing parent, because that would silently
 * demote a pedigree animal to G0.
 */
export function resolveGeneration(
  sire: ParentResolution,
  dam: ParentResolution,
  currentGeneration: number,
): GenerationOutcome {
  if (sire.state === 'LOOKUP_ERROR' || dam.state === 'LOOKUP_ERROR') {
    return { state: 'LOOKUP_ERROR', keepGeneration: currentGeneration };
  }

  const missing: ParentRole[] = [];
  if (sire.state === 'NOT_FOUND') missing.push('SIRE');
  if (dam.state === 'NOT_FOUND') missing.push('DAM');
  if (missing.length > 0) {
    // A real absence is not an error and not a rejection (§9.2).
    return { state: 'PARENT_MISSING', generation: 0, origin: 'G0', missing };
  }

  const sireGeneration = (sire as { generation: number }).generation;
  const damGeneration = (dam as { generation: number }).generation;
  return {
    state: 'COMPUTED',
    generation: 1 + Math.min(sireGeneration, damGeneration),
    origin: 'INTERNAL_G1PLUS',
  };
}

export const MAX_ANCESTRY_DEPTH = 64;

/**
 * Refuse a parent link that would make an animal its own ancestor.
 *
 * `ancestorsOf` walks upwards one record at a time, so this works against the
 * database without loading a whole tree. The depth cap is a safety net against
 * a cycle that already exists in data.
 */
export async function wouldCreateCycle(
  childId: string,
  parentId: string,
  ancestorsOf: (animalId: string) => Promise<readonly string[]>,
): Promise<boolean> {
  if (childId === parentId) return true;

  const seen = new Set<string>([childId]);
  let frontier: string[] = [parentId];

  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      if (id === childId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(...(await ancestorsOf(id)));
    }
    if (next.includes(childId)) return true;
    frontier = next;
  }
  return false;
}

/** Pedigree codes are compared in one canonical shape so spacing or case never matters. */
export function normalizePedigreeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function assertPedigreeCode(raw: string): string {
  const value = normalizePedigreeCode(raw);
  if (value.length < 3) throw validation('کد شجره‌نامه معتبر نیست.');
  if (value.length > 64) throw validation('کد شجره‌نامه بیش از حد طولانی است.');
  return value;
}

/** `G0`, `G1`, … for display. The number itself is never editable. */
export function generationLabel(generation: number): string {
  return 'G' + generation;
}
