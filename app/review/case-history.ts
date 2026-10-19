import { auditTrail } from '../../src/audit/service.ts';
import { statusOf } from '../../src/ui/status-dictionary.ts';
import { whenFa, type HistoryEntry } from '../../src/ui/desk.tsx';
import { db } from '../../src/db/client.ts';

/**
 * «سابقه پرونده» of one reviewed record from its audit rows, newest first.
 * The caller has already authorized the record. Who acted is left out (the
 * desk shows what happened, not which colleague did it); the reason recorded
 * with each step is its body.
 */
export async function caseHistory(
  targetType: string,
  targetId: string,
  titles: Readonly<Record<string, string>>,
): Promise<HistoryEntry[]> {
  const page = await auditTrail(db(), { targetType, targetId }, { page: 1, pageSize: 20 });
  return page.items.map((row, index) => {
    const after = (row.after ?? {}) as { status?: unknown; publicStatus?: unknown };
    const key = typeof after.status === 'string' ? after.status : typeof after.publicStatus === 'string' ? after.publicStatus : null;
    return {
      id: row.id,
      title: (titles[row.action] ?? 'تغییر پرونده') + (row.targetVersion ? '، نسخه ' + row.targetVersion.toLocaleString('fa-IR') : ''),
      whenFa: whenFa(row.occurredAt),
      status: key && statusOf(key)?.labelFa ? key : undefined,
      body: row.reason ?? undefined,
      current: index === 0,
    };
  });
}
