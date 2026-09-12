/**
 * Reading a service page — Requirements-Phase-2 §18, §22 (PROMPT-013).
 *
 * The page text is fixed in the catalogue; everything that can change — the fee
 * and the approved notices — is read from managed settings at request time. A
 * fee nobody has entered is reported as unconfigured, never as zero and never
 * as free.
 */
import type { DbClient } from '../db/client.ts';
import { readMoney, readSetting } from '../settings/service.ts';
import { formatTomanFa, type MoneyValue } from '../domain/money.ts';
import { SERVICE_CATALOGUE, serviceBySlug, type ServiceDefinition } from './catalogue.ts';

export interface ServiceView {
  readonly service: ServiceDefinition;
  readonly fee: MoneyValue | null;
  /** The fee as a visitor reads it, or null when no figure is recorded. */
  readonly feeFa: string | null;
  readonly noticeFa: string | null;
}

async function noticeOf(database: DbClient, key: string | undefined): Promise<string | null> {
  if (!key) return null;
  const row = await readSetting(database, key);
  return row.value === null ? null : String(row.value);
}

/** One service with its managed figures, or null for an address nobody published. */
export async function serviceView(database: DbClient, slug: string): Promise<ServiceView | null> {
  const service = serviceBySlug(slug);
  if (service === null) return null;

  const fee = service.feeSettingKey === null ? null : await readMoney(database, service.feeSettingKey);
  return {
    service,
    fee,
    feeFa: fee === null ? null : formatTomanFa(fee),
    noticeFa: await noticeOf(database, service.noticeSettingKey),
  };
}

/** Every service, for the list page, each with the figure that is really recorded. */
export async function serviceViews(database: DbClient): Promise<ServiceView[]> {
  return Promise.all(SERVICE_CATALOGUE.map((service) => serviceView(database, service.slug) as Promise<ServiceView>));
}
