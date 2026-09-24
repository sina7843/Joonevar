/**
 * The marketplace operations surface — PROMPT-002.
 *
 * Reading and changing the managed values of Phase 3, grouped the way an
 * operator thinks about them, with the history of each one. It is a thin layer
 * over the existing settings and audit services: the permission check, the
 * versioning and the audit row all still happen there, and nothing here reaches
 * the table directly.
 */
import type { Database, DbClient } from '../db/client.ts';
import type { Actor } from '../authz/actor.ts';
import {
  canReadSettingGroup,
  canWriteSettingGroup,
  assertCanReadSettingGroup,
  type SettingGroupName,
} from '../authz/policy.ts';
import { listSettingsForActor, updateSetting, type SettingRecord } from '../settings/service.ts';
import { SETTING_BY_KEY } from '../settings/keys.ts';
import { auditTrail, type AuditRow } from '../audit/service.ts';
import { notFound, validation } from '../domain/errors.ts';
import type { Page } from '../domain/pagination.ts';
import { assertMarketplaceCapability } from './model.ts';

/** The four Phase 3 groups, in the order the panel shows them. */
export const MARKET_SETTING_GROUPS = [
  'MARKETPLACE_OPERATIONS',
  'ANIMAL_MARKET',
  'COMMERCE',
  'SETTLEMENT',
] as const satisfies readonly SettingGroupName[];

export type MarketSettingGroup = (typeof MARKET_SETTING_GROUPS)[number];

export const MARKET_GROUP_FA: Record<MarketSettingGroup, string> = {
  MARKETPLACE_OPERATIONS: 'کلیدهای قطع و وصل',
  ANIMAL_MARKET: 'بازار فروش حیوان',
  COMMERCE: 'فروشگاه کالا',
  SETTLEMENT: 'تسویه',
};

export const isMarketSettingGroup = (value: unknown): value is MarketSettingGroup =>
  typeof value === 'string' && (MARKET_SETTING_GROUPS as readonly string[]).includes(value);

export interface MarketSettingGroupView {
  readonly group: MarketSettingGroup;
  readonly labelFa: string;
  readonly writable: boolean;
  readonly settings: readonly SettingRecord[];
  readonly configured: number;
  readonly unset: number;
}

/**
 * Every group this actor may read, with its values.
 *
 * A group the actor cannot read is left out rather than rendered empty, so the
 * panel never implies there is something there to ask for.
 */
export async function marketSettingGroups(
  database: DbClient,
  actor: Actor,
  only?: MarketSettingGroup,
): Promise<readonly MarketSettingGroupView[]> {
  const groups = (only ? [only] : MARKET_SETTING_GROUPS).filter((group) => canReadSettingGroup(actor, group));
  if (only && groups.length === 0) assertCanReadSettingGroup(actor, only);

  const views: MarketSettingGroupView[] = [];
  for (const group of groups) {
    const settings = await listSettingsForActor(database, actor, group);
    views.push({
      group,
      labelFa: MARKET_GROUP_FA[group],
      writable: canWriteSettingGroup(actor, group),
      settings,
      configured: settings.filter((s) => s.configured).length,
      unset: settings.filter((s) => !s.configured).length,
    });
  }
  return views;
}

/**
 * Change one marketplace value.
 *
 * Two gates, deliberately: the capability says this role does this kind of
 * work at all, and `updateSetting` says this context may write this group. They
 * are kept in agreement by a test rather than by one calling the other, so a
 * future role added to only one of them fails loudly.
 */
export async function updateMarketSetting(
  database: Database,
  actor: Actor,
  input: { key: string; value: unknown; reason: string; expectedVersion: number },
): Promise<SettingRecord> {
  assertMarketplaceCapability(actor, 'MARKET_SETTINGS_WRITE');
  const definition = SETTING_BY_KEY.get(input.key);
  if (!definition) throw notFound('این تنظیم وجود ندارد.');
  if (!isMarketSettingGroup(definition.group)) {
    throw validation('این تنظیم از مسیر بازار تغییر نمی‌کند؛ از پنل تنظیمات محصول استفاده کنید.');
  }
  const reason = input.reason.trim();
  if (reason === '') throw validation('دلیل این تغییر را بنویسید؛ در تاریخچه ثبت می‌شود.');
  return updateSetting(database, actor, {
    key: input.key,
    value: input.value,
    reason,
    expectedVersion: input.expectedVersion,
  });
}

export interface SettingChange extends AuditRow {
  /** The two values put side by side, so the page does not have to unpick the JSON. */
  readonly beforeValue: string;
  readonly afterValue: string;
}

const shown = (value: unknown): string => {
  if (value === null || value === undefined) return 'تعیین‌نشده';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/**
 * The history of one managed value, newest first, as before/after pairs.
 *
 * Reading a history is reading the setting, so it is gated by the same group
 * permission the value itself is.
 */
export async function settingHistory(
  database: Database,
  actor: Actor,
  key: string,
  request: { page: number; pageSize: number },
): Promise<Page<SettingChange>> {
  const definition = SETTING_BY_KEY.get(key);
  if (!definition) throw notFound('این تنظیم وجود ندارد.');
  assertCanReadSettingGroup(actor, definition.group);

  const trail = await auditTrail(database, { targetType: 'PRODUCT_SETTING', targetId: key }, request);
  return {
    ...trail,
    items: trail.items.map((row) => ({
      ...row,
      beforeValue: shown((row.before as { value?: unknown } | null)?.value ?? null),
      afterValue: shown((row.after as { value?: unknown } | null)?.value ?? null),
    })),
  };
}
