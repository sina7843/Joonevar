'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { readSettingForActor, updateSetting } from '../../../src/settings/service.ts';
import { displaySetting } from '../../../src/settings/display.ts';
import { SETTING_BY_KEY } from '../../../src/settings/keys.ts';
import { AppError, staleOf } from '../../../src/domain/errors.ts';

export interface SettingFormState {
  readonly ok?: boolean;
  readonly message?: string;
  /** The version just saved (DS P11 › Saved «نسخه N ذخیره شد»). */
  readonly savedVersion?: number;
  /** Someone saved this key after it was opened (DS P11 › Conflict): its current value and version. */
  readonly stale?: boolean;
  readonly current?: { readonly display: string; readonly version: number };
}

/**
 * Editing one managed value — §21.4, D15, D16.
 *
 * The value is parsed according to the declared kind and validated inside the
 * service, which also records who changed it, when, and what it was before. An
 * empty value clears the setting back to NOT_CONFIGURED rather than becoming a
 * zero or an empty string.
 */
export async function updateSettingAction(
  _previous: SettingFormState,
  form: FormData,
): Promise<SettingFormState> {
  const key = String(form.get('key') ?? '');
  const guard = await guardRoute('/admin/settings');
  try {
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

    const saved = await updateSetting(db(), guard.actor, {
      key,
      value,
      reason: String(form.get('reason') ?? '').trim(),
      expectedVersion: Number(form.get('version')),
    });
    revalidatePath('/admin/settings');
    return { ok: true, savedVersion: saved.version, message: raw === '' ? 'مقدار پاک شد و به «تعیین‌نشده» برگشت.' : 'مقدار ذخیره شد.' };
  } catch (error) {
    // The service refuses a save on an older version with CONFLICT; the panel shows what is there now.
    if (error instanceof AppError && error.code === 'CONFLICT' && guard.ok) {
      const now = await readSettingForActor(db(), guard.actor, key);
      return { ok: false, stale: true, current: { display: displaySetting(now), version: now.version } };
    }
    if (error instanceof AppError) return { ok: false, message: error.message, ...staleOf(error) };
    if (error instanceof SyntaxError) return { ok: false, message: 'مقدار JSON معتبر نیست.' };
    throw error;
  }
}
