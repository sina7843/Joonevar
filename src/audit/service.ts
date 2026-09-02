/**
 * Audit writer — §23.3.
 *
 * Audit rows are written inside the same transaction as the change they
 * describe. Writing them afterwards would allow a committed change with no
 * trace, which is exactly what the audit requirement exists to prevent.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { auditEvents } from '../db/schema/core.ts';
import type { Actor } from '../authz/actor.ts';
import { offsetOf, pageOf, type Page, type PageRequest } from '../domain/pagination.ts';

export interface AuditWrite {
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetVersion?: number | null;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly reason?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

/**
 * Keys that must never reach the audit log or any other log (§23.3, security
 * rules). Redaction happens here so a caller cannot forget it.
 */
const REDACTED_KEYS = [
  'otp',
  'code',
  'token',
  'secret',
  'password',
  'nationalid',
  'national_id',
  'cardnumber',
  'card_number',
  'accountnumber',
  'account_number',
  'iban',
  'receipt',
  'filebytes',
  'authorization',
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACTED_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(raw, depth + 1);
  }
  return out;
}

export async function recordAudit(tx: DbClient, actor: Actor | null, event: AuditWrite): Promise<void> {
  await tx.insert(auditEvents).values({
    actorType: actor === null ? 'SYSTEM' : 'ACCOUNT',
    actorAccountId: actor?.accountId ?? null,
    actorContext: actor?.context ?? null,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    targetVersion: event.targetVersion ?? null,
    before: event.before === undefined ? null : redact(event.before),
    after: event.after === undefined ? null : redact(event.after),
    reason: event.reason ?? null,
    metadata: event.metadata ? (redact(event.metadata) as Record<string, unknown>) : null,
  });
}

export interface AuditRow {
  id: string;
  occurredAt: Date;
  actorType: 'ACCOUNT' | 'SYSTEM';
  actorAccountId: string | null;
  actorContext: string | null;
  action: string;
  targetType: string;
  targetId: string;
  targetVersion: number | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** History of one record, newest first. Callers are responsible for scoping the target to the actor. */
export async function auditTrail(
  database: Database,
  target: { targetType: string; targetId: string },
  request: PageRequest,
): Promise<Page<AuditRow>> {
  const where = and(eq(auditEvents.targetType, target.targetType), eq(auditEvents.targetId, target.targetId));
  const rows = await database
    .select()
    .from(auditEvents)
    .where(where)
    .orderBy(desc(auditEvents.occurredAt))
    .limit(request.pageSize)
    .offset(offsetOf(request));
  const [counted] = await database.select({ total: sql<string>`count(*)` }).from(auditEvents).where(where);
  return pageOf(rows as AuditRow[], Number(counted?.total ?? 0), request);
}
