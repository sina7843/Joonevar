/**
 * Product settings service — D15, D16, §21.4.
 *
 * Two distinct callers exist and they are kept apart on purpose:
 *  - the product itself reads the effective value (`readSetting`, `readMoney`);
 *  - an operator reads or writes through the admin panel and must pass the
 *    per-group permission check (`listSettingsForActor`, `updateSetting`).
 *
 * Every write bumps `version` and writes an audit row with before/after in the
 * same transaction. Records that depend on a value snapshot it together with
 * that version, so a later tariff edit never rewrites history (§22).
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database, DbClient } from '../db/client.ts';
import { productSettings } from '../db/schema/core.ts';
import { recordAudit } from '../audit/service.ts';
import type { Actor } from '../authz/actor.ts';
import {
  assertCanReadSettingGroup,
  assertCanWriteSettingGroup,
  readableSettingGroups,
  type SettingGroupName,
} from '../authz/policy.ts';
import { conflict, notConfigured, notFound, validation } from '../domain/errors.ts';
import { configuredMoney, NOT_CONFIGURED_MONEY, toman, type MoneyValue } from '../domain/money.ts';
import { SETTING_BY_KEY, type SettingDefinition } from './keys.ts';

export interface SettingRecord {
  readonly key: string;
  readonly group: SettingGroupName;
  readonly kind: SettingDefinition['kind'];
  readonly source: SettingDefinition['source'];
  readonly labelFa: string;
  readonly noteFa: string | null;
  /** null means NOT_CONFIGURED. */
  readonly value: unknown;
  readonly configured: boolean;
  readonly version: number;
  readonly updatedAt: Date;
}

function toRecord(row: typeof productSettings.$inferSelect): SettingRecord {
  return {
    key: row.key,
    group: row.group as SettingGroupName,
    kind: row.kind as SettingDefinition['kind'],
    source: row.source as SettingDefinition['source'],
    labelFa: row.labelFa,
    noteFa: row.noteFa,
    value: row.value,
    configured: row.value !== null,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

async function loadRow(database: DbClient, key: string) {
  const [row] = await database
    .select()
    .from(productSettings)
    .where(and(eq(productSettings.key, key), eq(productSettings.scopeType, 'GLOBAL'), eq(productSettings.scopeId, '')))
    .limit(1);
  if (!row) throw notFound('Unknown product setting: ' + key);
  return row;
}

/** Effective value used by the product itself. No actor: this is not an operator read. */
export async function readSetting(database: DbClient, key: string): Promise<SettingRecord> {
  return toRecord(await loadRow(database, key));
}

/**
 * Money read. Returns an explicit unconfigured value rather than 0, so a
 * missing tariff can never be presented as free (§22).
 */
export async function readMoney(database: DbClient, key: string): Promise<MoneyValue> {
  const row = await loadRow(database, key);
  if (row.kind !== 'MONEY_TOMAN') throw validation('Setting ' + key + ' is not a monetary setting');
  if (row.value === null) return NOT_CONFIGURED_MONEY;
  return configuredMoney(String(row.value));
}

export async function readInt(database: DbClient, key: string): Promise<number> {
  const row = await loadRow(database, key);
  if (row.kind !== 'INT') throw validation('Setting ' + key + ' is not an integer setting');
  if (row.value === null) throw notConfigured(key);
  return Number(row.value);
}

export async function readText(database: DbClient, key: string): Promise<string> {
  const row = await loadRow(database, key);
  if (row.value === null) throw notConfigured(key);
  return String(row.value);
}

/**
 * Snapshot for a record that must keep the value it was created with —
 * referral expiry, a payment item amount, a fee shown on a receipt.
 */
export interface SettingSnapshot {
  readonly key: string;
  readonly value: unknown;
  readonly version: number;
}

export async function snapshotSetting(database: DbClient, key: string): Promise<SettingSnapshot> {
  const row = await loadRow(database, key);
  if (row.value === null) throw notConfigured(key);
  return { key: row.key, value: row.value, version: row.version };
}

/** Admin panel read, scoped per group (§21.4). */
export async function listSettingsForActor(
  database: DbClient,
  actor: Actor,
  group?: SettingGroupName,
): Promise<readonly SettingRecord[]> {
  const groups = group ? [group] : readableSettingGroups(actor);
  if (group) assertCanReadSettingGroup(actor, group);
  if (groups.length === 0) return [];
  const rows = await database
    .select()
    .from(productSettings)
    .where(inArray(productSettings.group, groups as unknown as SettingGroupName[]))
    .orderBy(asc(productSettings.group), asc(productSettings.key));
  return rows.map(toRecord);
}

export async function readSettingForActor(database: DbClient, actor: Actor, key: string): Promise<SettingRecord> {
  const row = await loadRow(database, key);
  assertCanReadSettingGroup(actor, row.group as SettingGroupName);
  return toRecord(row);
}

function validateValue(definition: SettingDefinition, raw: unknown): unknown {
  switch (definition.kind) {
    case 'INT': {
      const n = typeof raw === 'number' ? raw : Number(String(raw));
      if (!Number.isInteger(n)) throw validation(definition.key + ' must be an integer');
      if (definition.min !== undefined && n < definition.min) {
        throw validation(definition.key + ' must be at least ' + definition.min);
      }
      if (definition.max !== undefined && n > definition.max) {
        throw validation(definition.key + ' must be at most ' + definition.max);
      }
      return n;
    }
    case 'MONEY_TOMAN':
      // Stored as an exact decimal string; parsing through `toman` rejects
      // floats, negatives and anything that is not a whole Toman amount.
      return toman(typeof raw === 'number' || typeof raw === 'bigint' ? raw : String(raw)).toString();
    case 'BOOL':
      if (typeof raw !== 'boolean') throw validation(definition.key + ' must be a boolean');
      return raw;
    case 'STRING':
    case 'TEXT': {
      if (typeof raw !== 'string') throw validation(definition.key + ' must be a string');
      const trimmed = raw.trim();
      if (trimmed === '') throw validation(definition.key + ' must not be empty; clear it instead to mark NOT_CONFIGURED');
      return trimmed;
    }
    case 'JSON':
      if (typeof raw !== 'object' || raw === null) throw validation(definition.key + ' must be a JSON object');
      return raw;
  }
}

export interface UpdateSettingInput {
  readonly key: string;
  /** null clears the value back to NOT_CONFIGURED. */
  readonly value: unknown;
  readonly reason?: string;
  /** Optimistic guard: reject a write based on a stale reading of the panel. */
  readonly expectedVersion?: number;
}

export async function updateSetting(
  database: Database,
  actor: Actor,
  input: UpdateSettingInput,
): Promise<SettingRecord> {
  const definition = SETTING_BY_KEY.get(input.key);
  if (!definition) throw notFound('Unknown product setting: ' + input.key);

  return database.transaction(async (tx) => {
    const row = await loadRow(tx, input.key);
    assertCanWriteSettingGroup(actor, row.group as SettingGroupName);

    if (input.expectedVersion !== undefined && input.expectedVersion !== row.version) {
      throw conflict('Setting was changed by someone else', {
        expectedVersion: input.expectedVersion,
        actualVersion: row.version,
      });
    }

    const nextValue = input.value === null ? null : validateValue(definition, input.value);
    const nextVersion = row.version + 1;

    const [updated] = await tx
      .update(productSettings)
      .set({
        value: nextValue,
        version: nextVersion,
        updatedByAccountId: actor.accountId,
        updatedAt: new Date(),
      })
      .where(and(eq(productSettings.id, row.id), eq(productSettings.version, row.version)))
      .returning();

    if (!updated) throw conflict('Setting was changed concurrently');

    await recordAudit(tx, actor, {
      action: 'PRODUCT_SETTING_UPDATED',
      targetType: 'PRODUCT_SETTING',
      targetId: row.key,
      targetVersion: nextVersion,
      before: { value: row.value, version: row.version, configured: row.value !== null },
      after: { value: nextValue, version: nextVersion, configured: nextValue !== null },
      reason: input.reason ?? null,
    });

    return toRecord(updated);
  });
}

/** Keys that still have no real value, for the health endpoint and readiness reporting. */
export async function unconfiguredKeys(database: DbClient): Promise<readonly string[]> {
  const rows = await database
    .select({ key: productSettings.key })
    .from(productSettings)
    .where(isNull(productSettings.value))
    .orderBy(asc(productSettings.key));
  return rows.map((r) => r.key);
}
