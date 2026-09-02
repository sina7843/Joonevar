import { SERVICES_BY_CONTEXT, type VisitContextName, type VisitServiceTypeName } from '../../src/domain/referral.ts';

/**
 * The animal/service choices while the person is still choosing.
 *
 * They travel in the URL rather than as half-created rows, so leaving the
 * Finder to change the selection cannot leave orphaned requests behind, and the
 * back button and a shared link both keep working. Nothing is persisted until
 * the review step is confirmed.
 */
export interface SelectionItem {
  readonly animalId: string;
  readonly serviceType: VisitServiceTypeName;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeSelection(items: readonly SelectionItem[]): string {
  return items.map((item) => item.animalId + ':' + item.serviceType).join(',');
}

/** Anything malformed is dropped rather than guessed at. */
export function parseSelection(raw: string, context: VisitContextName): readonly SelectionItem[] {
  const allowed = SERVICES_BY_CONTEXT[context];
  const out: SelectionItem[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const [animalId, serviceType] = part.split(':');
    if (!animalId || !serviceType) continue;
    if (!UUID.test(animalId) || seen.has(animalId)) continue;
    if (!(allowed as readonly string[]).includes(serviceType)) continue;
    seen.add(animalId);
    out.push({ animalId, serviceType: serviceType as VisitServiceTypeName });
  }
  return out;
}
