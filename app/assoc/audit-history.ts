import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../src/db/client.ts';
import { auditEvents } from '../../src/db/schema/core.ts';
import { profiles } from '../../src/db/schema/identity.ts';
import { statusOf } from '../../src/ui/status-dictionary.ts';
import { whenFa, type HistoryEntry } from '../../src/ui/desk.tsx';

export interface AuditStep {
  readonly id: string;
  readonly at: Date;
  readonly action: string;
  readonly actorName: string | null;
  readonly system: boolean;
  readonly version: number | null;
  readonly status: string | null;
  readonly reason: string | null;
}

/**
 * The audit rows of one case, newest first, with the actor's name (read-only;
 * the desk page has already authorized the case). Feeds «سابقه پرونده».
 */
export async function auditSteps(targetType: string, targetId: string, limit = 50): Promise<AuditStep[]> {
  const rows = await db()
    .select({ event: auditEvents, firstName: profiles.firstName, lastName: profiles.lastName })
    .from(auditEvents)
    .leftJoin(profiles, eq(profiles.accountId, auditEvents.actorAccountId))
    .where(and(eq(auditEvents.targetType, targetType), eq(auditEvents.targetId, targetId)))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);
  return rows.map(({ event, firstName, lastName }) => {
    // Most modules store `status`; clubs store `lifecycle`.
    const after = event.after as { status?: unknown; lifecycle?: unknown } | null;
    const status = after ? (typeof after.status === 'string' ? after.status : typeof after.lifecycle === 'string' ? after.lifecycle : null) : null;
    return {
      id: event.id,
      at: event.occurredAt,
      action: event.action,
      actorName: firstName ? firstName + ' ' + (lastName ?? '') : null,
      system: event.actorType === 'SYSTEM',
      version: event.targetVersion,
      status,
      reason: event.reason,
    };
  });
}

/** «{who}، {when}» — the timeline meta line. */
export const stepMeta = (step: AuditStep): string =>
  [step.system ? 'همزیست' : step.actorName, whenFa(step.at)].filter(Boolean).join('، ');

/** A dictionary badge for a stored status, or none for a value the dictionary does not know. */
export const stepStatus = (status: string | null): HistoryEntry['status'] =>
  status && statusOf(status)?.labelFa ? status : undefined;

/**
 * Audit steps as timeline entries: only actions with a Persian title are shown
 * (an untitled action code is never printed raw); the newest is current while
 * the case is open.
 */
export function historyFromAudit(steps: readonly AuditStep[], titles: Readonly<Record<string, string>>, open: boolean): HistoryEntry[] {
  return steps
    .filter((step) => titles[step.action] !== undefined)
    .map((step, index) => ({
      id: step.id,
      title: titles[step.action]! + (step.version !== null ? '، نسخه ' + step.version.toLocaleString('fa-IR') : ''),
      whenFa: stepMeta(step),
      status: stepStatus(step.status),
      body: step.reason ?? undefined,
      current: open && index === 0,
    }));
}
