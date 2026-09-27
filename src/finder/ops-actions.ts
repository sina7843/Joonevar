'use server';

/**
 * Server actions for PROMPT-007: reports, blocks, feedback and appeals for
 * owners; queue, sanctions and reconciliation for operators. Every rule lives in
 * the services; these only read the form and name the route that guards them.
 */
import { revalidatePath } from 'next/cache';
import { db } from '../db/client.ts';
import { env } from '../config/env.ts';
import { guardRoute } from '../authz/guard.ts';
import { AppError, notFound } from '../domain/errors.ts';
import { accounts } from '../db/schema/core.ts';
import { eq } from 'drizzle-orm';
import { submitFinderReport, takeReport, decideFinderReport, appealFinderDecision, decideFinderAppeal } from './reports.ts';
import { blockPerson, imposeSanction, liftSanction, unblock } from './sanctions.ts';
import { reconcileFinder, submitFeedback } from './operations.ts';
import { assertFinderCapability } from './model.ts';
import type { FinderAction, FinderTarget } from './reports-model.ts';

export interface OpsFormState {
  readonly ok?: boolean;
  readonly message?: string;
}

const field = (form: FormData, name: string): string => String(form.get(name) ?? '').trim();

async function actorFor(route: string) {
  const guard = await guardRoute(route);
  if (!guard.ok) throw guard.denied;
  return guard.actor;
}

async function run(paths: readonly string[], work: () => Promise<string>): Promise<OpsFormState> {
  try {
    const message = await work();
    for (const p of paths) revalidatePath(p);
    return { ok: true, message };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, message: error.message };
    throw error;
  }
}

async function files(form: FormData) {
  const out = [];
  for (const entry of form.getAll('evidence')) {
    if (entry instanceof File && entry.size > 0) out.push({ bytes: new Uint8Array(await entry.arrayBuffer()), originalName: entry.name });
  }
  return out;
}

// ── owners ───────────────────────────────────────────────────────────────────

export async function finderReportAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run([], async () => {
    const actor = await actorFor('/report');
    const target = field(form, 'target') as FinderTarget;
    const mediaId = field(form, 'mediaId') || null;
    await submitFinderReport(db(), env().PRIVATE_STORAGE_DIR, actor, {
      target: target === 'PROFILE' && mediaId ? 'MEDIA' : target,
      id: field(form, 'id'),
      mediaId,
      category: field(form, 'category'),
      details: field(form, 'details') || null,
      evidence: await files(form),
    });
    return 'گزارش شما ثبت شد و بررسی می‌شود.';
  });
}

export async function blockPersonAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/account/mating-finder/blocks', '/account/mating-finder/requests'], async () => {
    const actor = await actorFor('/account/mating-finder/blocks');
    await blockPerson(db(), actor, { requestId: field(form, 'requestId') || undefined, profileId: field(form, 'profileId') || undefined });
    return 'این کاربر مسدود شد؛ دیگر پروفایل‌ها و پیام‌های یکدیگر را نمی‌بینید.';
  });
}

export async function unblockAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/account/mating-finder/blocks'], async () => {
    await unblock(db(), await actorFor('/account/mating-finder/blocks'), { blockId: field(form, 'blockId') });
    return 'مسدودی برداشته شد.';
  });
}

export async function feedbackAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  const requestId = field(form, 'requestId');
  return run(['/account/mating-finder/requests/' + requestId], async () => {
    await submitFeedback(db(), await actorFor('/account/mating-finder/requests'), { requestId, score: Number(field(form, 'score')), bodyFa: field(form, 'bodyFa') || null });
    return 'بازخورد محرمانه شما ثبت شد؛ فقط مدیریت آن را می‌بیند.';
  });
}

export async function appealAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/account/mating-finder/appeals'], async () => {
    await appealFinderDecision(db(), await actorFor('/account/mating-finder/appeals'), { reportId: field(form, 'reportId'), statementFa: field(form, 'statementFa') });
    return 'اعتراض شما ثبت شد و کسی جز تصمیم‌گیرنده اول آن را بررسی می‌کند.';
  });
}

// ── operators ────────────────────────────────────────────────────────────────

export async function takeReportAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/market/finder/reports'], async () => {
    await takeReport(db(), await actorFor('/market/finder/reports'), { reportId: field(form, 'reportId'), release: field(form, 'release') === 'yes' });
    return field(form, 'release') === 'yes' ? 'گزارش رها شد.' : 'گزارش برای بررسی شما برداشته شد.';
  });
}

export async function decideReportAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/market/finder/reports'], async () => {
    await decideFinderReport(db(), await actorFor('/market/finder/reports'), {
      reportId: field(form, 'reportId'),
      action: field(form, 'action') as FinderAction,
      reasonFa: field(form, 'reasonFa'),
    });
    return 'تصمیم ثبت شد.';
  });
}

export async function decideAppealAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/market/finder/reports'], async () => {
    await decideFinderAppeal(db(), await actorFor('/market/finder/reports'), {
      appealId: field(form, 'appealId'),
      uphold: field(form, 'uphold') === 'yes',
      reasonFa: field(form, 'reasonFa'),
    });
    return 'تصمیم درباره اعتراض ثبت شد.';
  });
}

export async function imposeSanctionAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/market/finder/sanctions'], async () => {
    const actor = await actorFor('/market/finder/sanctions');
    const scope = field(form, 'scope') === 'ACCOUNT' ? 'ACCOUNT' : 'FINDER_ACCESS';
    assertFinderCapability(actor, scope === 'ACCOUNT' ? 'FINDER_ACCOUNT_RESTRICT' : 'FINDER_ACCESS_SUSPEND');
    // Only a superadmin reaches this form; the account is named by its mobile number.
    const [account] = await db().select({ id: accounts.id }).from(accounts).where(eq(accounts.mobile, field(form, 'mobile'))).limit(1);
    if (!account) throw notFound('حسابی با این شماره پیدا نشد.');
    const days = field(form, 'days');
    await imposeSanction(db(), actor, { accountId: account.id, scope, reasonFa: field(form, 'reasonFa'), days: days === '' ? null : Number(days), reportId: field(form, 'reportId') || null });
    return scope === 'ACCOUNT' ? 'حساب محدود شد؛ ورود آن بسته است.' : 'دسترسی جفت‌یابی تعلیق شد.';
  });
}

export async function liftSanctionAction(_p: OpsFormState, form: FormData): Promise<OpsFormState> {
  return run(['/market/finder/sanctions'], async () => {
    await liftSanction(db(), await actorFor('/market/finder/sanctions'), { sanctionId: field(form, 'sanctionId'), reasonFa: field(form, 'reasonFa') });
    return 'محدودیت رفع شد.';
  });
}

export async function reconcileAction(_p: OpsFormState, _form: FormData): Promise<OpsFormState> {
  return run(['/market/finder'], async () => {
    const actor = await actorFor('/market/finder');
    assertFinderCapability(actor, 'FINDER_CONFIG_WRITE');
    const r = await reconcileFinder(db());
    return (
      'هماهنگ‌سازی انجام شد: ' +
      [
        r.expired + ' درخواست منقضی',
        r.transferred + ' پروفایل پس از انتقال',
        r.lifeEvents + ' پروفایل پس از رویداد حیات',
        r.overCapacity + ' پروفایل بیش از ظرفیت',
        r.reminders.expiring + r.reminders.window + ' یادآوری',
        r.otpPurged + ' کد منقضی',
      ].join('، ')
    );
  });
}
