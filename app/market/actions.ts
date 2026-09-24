'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../src/db/client.ts';
import { guardRoute } from '../../src/authz/guard.ts';
import { AppError } from '../../src/domain/errors.ts';
import { SETTING_BY_KEY } from '../../src/settings/keys.ts';
import { updateMarketSetting } from '../../src/marketplace/operations.ts';
import { setSpeciesEnabled } from '../../src/marketplace/species.ts';

export interface MarketFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * Change one managed marketplace value — PROMPT-002.
 *
 * The raw form value is turned into the declared kind here and validated in the
 * service, which also refuses a write made against a stale version. Leaving the
 * field empty clears the value back to NOT_CONFIGURED, which for a kill switch
 * reads as closed and for a tariff reads as «تعیین‌نشده» rather than free.
 */
export async function updateMarketSettingAction(
  _previous: MarketFormState,
  form: FormData,
): Promise<MarketFormState> {
  const key = String(form.get('key') ?? '');
  try {
    const guard = await guardRoute('/market/settings');
    if (!guard.ok) throw guard.denied;

    const definition = SETTING_BY_KEY.get(key);
    if (!definition) throw new AppError('NOT_FOUND', 'این تنظیم وجود ندارد.');

    const raw = String(form.get('value') ?? '').trim();
    const value =
      raw === ''
        ? null
        : definition.kind === 'BOOL'
          ? raw === 'true'
          : definition.kind === 'JSON'
            ? JSON.parse(raw)
            : definition.kind === 'INT'
              ? Number(raw)
              : raw;

    await updateMarketSetting(db(), guard.actor, {
      key,
      value,
      reason: String(form.get('reason') ?? ''),
      expectedVersion: Number(form.get('version')),
    });
    revalidatePath('/market');
    revalidatePath('/market/settings');
    revalidatePath('/market/settings/' + encodeURIComponent(key));
    return { ok: true, message: raw === '' ? 'مقدار پاک شد و به «تعیین‌نشده» برگشت.' : 'مقدار ذخیره شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (error instanceof SyntaxError) return { ok: false, message: 'مقدار JSON معتبر نیست.' };
    throw error;
  }
}

/** Open or close one species in one market — PROMPT-002. A reason is required both ways. */
export async function setSpeciesEnabledAction(
  _previous: MarketFormState,
  form: FormData,
): Promise<MarketFormState> {
  try {
    const guard = await guardRoute('/market/species');
    if (!guard.ok) throw guard.denied;

    const enabled = String(form.get('enabled') ?? '') === 'true';
    await setSpeciesEnabled(db(), guard.actor, {
      market: String(form.get('market') ?? ''),
      speciesCode: String(form.get('speciesCode') ?? ''),
      enabled,
      reasonFa: String(form.get('reason') ?? ''),
      expectedVersion: Number(form.get('version')),
    });
    revalidatePath('/market');
    revalidatePath('/market/species');
    return { ok: true, message: enabled ? 'این گونه فعال شد.' : 'این گونه غیرفعال شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
