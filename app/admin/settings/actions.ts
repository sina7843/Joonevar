'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { updateSetting } from '../../../src/settings/service.ts';
import { SETTING_BY_KEY } from '../../../src/settings/keys.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface SettingFormState {
  readonly ok?: boolean;
  readonly message?: string;
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
  try {
    const guard = await guardRoute('/admin/settings');
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

    await updateSetting(db(), guard.actor, {
      key,
      value,
      reason: String(form.get('reason') ?? '').trim() || undefined,
      expectedVersion: Number(form.get('version')),
    });
    revalidatePath('/admin/settings');
    return { ok: true, message: raw === '' ? 'مقدار پاک شد و به «تعیین‌نشده» برگشت.' : 'مقدار ذخیره شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    if (error instanceof SyntaxError) return { ok: false, message: 'مقدار JSON معتبر نیست.' };
    throw error;
  }
}
