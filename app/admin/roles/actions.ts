'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { setContentRole } from '../../../src/content/roles.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface RoleFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const text = (form: FormData, key: string): string => String(form.get(key) ?? '');

export async function setContentRoleAction(_previous: RoleFormState, form: FormData): Promise<RoleFormState> {
  try {
    const guard = await guardRoute('/admin/roles');
    if (!guard.ok) throw guard.denied;
    const active = text(form, 'action') === 'GRANT';
    await setContentRole(db(), guard.actor, {
      mobile: text(form, 'mobile'),
      role: text(form, 'role'),
      active,
      reason: text(form, 'reason'),
    });
    revalidatePath('/admin/roles');
    return { ok: true, message: active ? 'نقش فعال شد.' : 'نقش تعلیق شد.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
