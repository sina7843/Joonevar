/**
 * Known kinship from the lineage graph — PHASE-4 PROMPT-004.
 *
 * Pure: the caller hands in the parents it loaded, this walks them. The walk is
 * breadth-first, keeps the shortest distance to each ancestor, never revisits a
 * node (so a corrupt cycle cannot loop) and stops at a fixed depth.
 *
 * Degrees (the same scale the breed rule's `kinship_max_degree` uses):
 *   1 — parent/child, full siblings
 *   2 — grandparent/grandchild, half siblings, uncle/aunt
 *   3 — first cousins, great-grandparent, half uncle/aunt, …
 * Direct line: the number of generations between them. Collateral: the steps
 * through the nearest shared ancestor minus one, never below 2; full siblings
 * (both parents shared) are the one collateral case counted as 1.
 *
 * What it will not do: call a pair unrelated when the data cannot say so. An
 * animal with no recorded parent makes the answer UNKNOWN, never "safe".
 */
export interface Parents {
  readonly sire: string | null;
  readonly dam: string | null;
}

export const KINSHIP_DEPTH = 6;

export interface Kinship {
  /** KNOWN_RELATED, NONE_FOUND (both lines known, nothing shared within the depth), UNKNOWN. */
  readonly status: 'SELF' | 'KNOWN_RELATED' | 'NONE_FOUND' | 'UNKNOWN';
  readonly degree: number | null;
  readonly relationFa: string | null;
  readonly explanationFa: string;
}

/** Shortest generation distance from `start` to each ancestor (start itself at 0). */
export function ancestorDistances(start: string, parentsOf: ReadonlyMap<string, Parents>, depth = KINSHIP_DEPTH): Map<string, number> {
  const distance = new Map<string, number>([[start, 0]]);
  let frontier = [start];
  for (let level = 1; level <= depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      const parents = parentsOf.get(id);
      for (const parent of [parents?.sire ?? null, parents?.dam ?? null]) {
        if (parent === null || distance.has(parent)) continue;
        distance.set(parent, level);
        next.push(parent);
      }
    }
    frontier = next;
  }
  return distance;
}

const hasAnyParent = (id: string, parentsOf: ReadonlyMap<string, Parents>) => {
  const p = parentsOf.get(id);
  return Boolean(p && (p.sire || p.dam));
};

function relationFa(degree: number, fullSiblings: boolean, direct: boolean): string {
  if (degree === 1) return fullSiblings ? 'خواهر/برادر تنی' : direct ? 'والد و فرزند' : 'خویشاوند درجه یک';
  if (degree === 2) return 'خویشاوند درجه دو (ناتنی، پدربزرگ/نوه یا عمو/خاله)';
  return 'خویشاوند درجه ' + degree.toLocaleString('fa-IR');
}

export function kinshipOf(a: string, b: string, parentsOf: ReadonlyMap<string, Parents>, depth = KINSHIP_DEPTH): Kinship {
  if (a === b) return { status: 'SELF', degree: 0, relationFa: 'همان حیوان', explanationFa: 'یک حیوان با خودش جفت نمی‌شود.' };
  const fromA = ancestorDistances(a, parentsOf, depth);
  const fromB = ancestorDistances(b, parentsOf, depth);

  let best: { degree: number; fullSiblings: boolean; direct: boolean } | null = null;
  const consider = (degree: number, fullSiblings: boolean, direct: boolean) => {
    if (best === null || degree < best.degree || (degree === best.degree && (fullSiblings || direct))) best = { degree, fullSiblings, direct };
  };
  // Direct line: one is the other's ancestor.
  if (fromB.has(a)) consider(fromB.get(a)!, false, true);
  if (fromA.has(b)) consider(fromA.get(b)!, false, true);
  // Collateral: through the nearest shared ancestor.
  for (const [ancestor, da] of fromA) {
    if (ancestor === a || ancestor === b) continue;
    const db = fromB.get(ancestor);
    if (db === undefined) continue;
    consider(Math.max(2, da + db - 1), false, false);
  }
  const pa = parentsOf.get(a);
  const pb = parentsOf.get(b);
  if (pa?.sire && pa?.dam && pa.sire === pb?.sire && pa.dam === pb?.dam) consider(1, true, false);

  if (best !== null) {
    const found: { degree: number; fullSiblings: boolean; direct: boolean } = best;
    const text = relationFa(found.degree, found.fullSiblings, found.direct);
    return { status: 'KNOWN_RELATED', degree: found.degree, relationFa: text, explanationFa: 'در شجره ثبت‌شده، این دو ' + text + ' هستند.' };
  }
  if (!hasAnyParent(a, parentsOf) || !hasAnyParent(b, parentsOf)) {
    return {
      status: 'UNKNOWN',
      degree: null,
      relationFa: null,
      explanationFa: 'والدین دست‌کم یکی از دو حیوان در همزیست ثبت نشده است؛ نبود خویشاوندی قابل تأیید نیست.',
    };
  }
  return {
    status: 'NONE_FOUND',
    degree: null,
    relationFa: null,
    explanationFa:
      'در ' + depth.toLocaleString('fa-IR') + ' نسل ثبت‌شده، جد مشترکی پیدا نشد. این یعنی نبود خویشاوندی در داده ثبت‌شده، نه تضمین آن.',
  };
}
