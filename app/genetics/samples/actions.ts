'use server';

import { revalidatePath } from 'next/cache';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { instructSend } from '../../../src/clinical/samples.ts';
import { AppError } from '../../../src/domain/errors.ts';

export interface GeneticsFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

/**
 * The centre asks for a sample it is ready to receive (§12.4, D07). Until then
 * the veterinarian keeps it, and nothing expires it in the meantime.
 */
export async function instructSendAction(
  _previous: GeneticsFormState,
  form: FormData,
): Promise<GeneticsFormState> {
  try {
    const guard = await guardRoute('/genetics/samples');
    if (!guard.ok) throw guard.denied;
    await instructSend(db(), guard.actor, String(form.get('sampleId') ?? ''));
    revalidatePath('/genetics/samples');
    return { ok: true, message: 'دستور ارسال صادر شد. ثبت ارسال روی همان کد رهگیری انجام می‌شود.' };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}
