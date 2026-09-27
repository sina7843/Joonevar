'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { FileField, SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import {
  appealAction,
  blockPersonAction,
  decideAppealAction,
  decideReportAction,
  feedbackAction,
  finderReportAction,
  imposeSanctionAction,
  liftSanctionAction,
  reconcileAction,
  takeReportAction,
  unblockAction,
  type OpsFormState,
} from './ops-actions.ts';
import { ACTION_FA, CATEGORY_FA, FINDER_REPORT_CATEGORIES, type FinderAction } from './reports-model.ts';

const EMPTY: OpsFormState = {};
type Opt = ReadonlyArray<{ value: string; label: string }>;
const CATEGORIES: Opt = FINDER_REPORT_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_FA[c] }));

/** One report form for every finder target; the target and its id come from the page, never from the person. */
export function FinderReportForm({
  target,
  id,
  images,
  testId = 'finder-report',
}: {
  target: 'PROFILE' | 'MESSAGE' | 'REQUEST' | 'ACCOUNT';
  id: string;
  images?: Opt;
  testId?: string;
}) {
  const [state, submit, pending] = useActionState(finderReportAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid={testId + '-form'}>
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="id" value={id} />
      {images && images.length > 0 ? <SelectField label="موضوع" name="mediaId" placeholder="کل پروفایل" options={images} data-testid={testId + '-target'} /> : null}
      <SelectField label="نوع گزارش" name="category" required options={CATEGORIES} data-testid={testId + '-category'} />
      <div className="sm:col-span-2">
        <TextAreaField label="توضیح" name="details" rows={2} maxLength={1000} data-testid={testId + '-details'} />
      </div>
      <div className="sm:col-span-2">
        <FileField label="مدرک (تصویر یا PDF، اختیاری و خصوصی)" name="evidence" accept="image/jpeg,image/png,application/pdf" maxBytes={10 * 1024 * 1024} testId={testId + '-evidence'} />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" tone="ghost" disabled={pending} data-testid={testId + '-submit'}>
          ثبت گزارش
        </Button>
        <Result state={state} testId={testId + '-result'} />
      </div>
    </form>
  );
}

export function BlockPersonForm({ requestId, profileId }: { requestId?: string; profileId?: string }) {
  const [state, submit, pending] = useActionState(blockPersonAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex flex-wrap items-center gap-sm" data-testid="finder-block-person-form">
      {requestId ? <input type="hidden" name="requestId" value={requestId} /> : null}
      {profileId ? <input type="hidden" name="profileId" value={profileId} /> : null}
      <Button type="submit" tone="ghost" disabled={pending} data-testid="finder-block-person">
        مسدودکردن این کاربر در جفت‌یابی
      </Button>
      <Result state={state} testId="finder-block-person-result" />
    </form>
  );
}

export function UnblockForm({ blockId }: { blockId: string }) {
  const [state, submit, pending] = useActionState(unblockAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex items-center gap-sm">
      <input type="hidden" name="blockId" value={blockId} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'finder-unblock-' + blockId}>
        برداشتن مسدودی
      </Button>
      <Result state={state} testId={'finder-unblock-result-' + blockId} />
    </form>
  );
}

export function FeedbackForm({ requestId }: { requestId: string }) {
  const [state, submit, pending] = useActionState(feedbackAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid="finder-feedback-form">
      <input type="hidden" name="requestId" value={requestId} />
      <SelectField
        label="ارزیابی کلی"
        name="score"
        required
        options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: n.toLocaleString('fa-IR') + ' از ۵' }))}
        data-testid="finder-feedback-score"
      />
      <div className="sm:col-span-2">
        <TextAreaField label="توضیح محرمانه (اختیاری)" name="bodyFa" rows={2} maxLength={1000} />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid="finder-feedback-submit">
          ثبت بازخورد محرمانه
        </Button>
        <Result state={state} testId="finder-feedback-result" />
      </div>
    </form>
  );
}

export function AppealForm({ reportId }: { reportId: string }) {
  const [state, submit, pending] = useActionState(appealAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm space-y-sm" data-testid={'finder-appeal-form-' + reportId}>
      <input type="hidden" name="reportId" value={reportId} />
      <TextAreaField label="متن اعتراض" name="statementFa" rows={3} maxLength={2000} required data-testid="finder-appeal-text" />
      <div className="flex flex-wrap items-center gap-md">
        <Button type="submit" disabled={pending} data-testid="finder-appeal-submit">
          ثبت اعتراض
        </Button>
        <Result state={state} testId="finder-appeal-result" />
      </div>
    </form>
  );
}

// ── operators ────────────────────────────────────────────────────────────────

export function TakeReportForm({ reportId, release }: { reportId: string; release: boolean }) {
  const [state, submit, pending] = useActionState(takeReportAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex flex-wrap items-center gap-sm">
      <input type="hidden" name="reportId" value={reportId} />
      {release ? <input type="hidden" name="release" value="yes" /> : null}
      <Button type="submit" tone={release ? 'ghost' : 'secondary'} disabled={pending} data-testid={(release ? 'finder-release-' : 'finder-take-') + reportId}>
        {release ? 'رهاکردن' : 'برداشتن برای بررسی'}
      </Button>
      <Result state={state} testId={'finder-take-result-' + reportId} />
    </form>
  );
}

export function DecideReportForm({ reportId, actions }: { reportId: string; actions: readonly FinderAction[] }) {
  const [state, submit, pending] = useActionState(decideReportAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid={'finder-decide-form-' + reportId}>
      <input type="hidden" name="reportId" value={reportId} />
      <SelectField label="تصمیم" name="action" required options={actions.map((a) => ({ value: a, label: ACTION_FA[a] }))} data-testid={'finder-decide-action-' + reportId} />
      <TextField label="دلیل (به کاربر نشان داده می‌شود)" name="reasonFa" required maxLength={500} data-testid={'finder-decide-reason-' + reportId} />
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid={'finder-decide-' + reportId}>
          ثبت تصمیم
        </Button>
        <Result state={state} testId={'finder-decide-result-' + reportId} />
      </div>
    </form>
  );
}

export function DecideAppealForm({ appealId }: { appealId: string }) {
  const [state, submit, pending] = useActionState(decideAppealAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm grid gap-sm sm:grid-cols-2" data-testid={'finder-appeal-decide-form-' + appealId}>
      <input type="hidden" name="appealId" value={appealId} />
      <SelectField
        label="نتیجه"
        name="uphold"
        required
        options={[
          { value: 'yes', label: 'تصمیم پابرجاست' },
          { value: 'no', label: 'اعتراض پذیرفته شد و اقدام برگردانده شود' },
        ]}
      />
      <TextField label="دلیل" name="reasonFa" required maxLength={500} />
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid={'finder-appeal-decide-' + appealId}>
          ثبت
        </Button>
        <Result state={state} testId={'finder-appeal-decide-result-' + appealId} />
      </div>
    </form>
  );
}

export function ImposeSanctionForm({ canRestrictAccount }: { canRestrictAccount: boolean }) {
  const [state, submit, pending] = useActionState(imposeSanctionAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="grid gap-sm sm:grid-cols-2" data-testid="finder-sanction-form">
      <TextField label="شماره موبایل حساب" name="mobile" required ltr maxLength={11} data-testid="finder-sanction-mobile" />
      <SelectField
        label="نوع"
        name="scope"
        required
        options={[
          { value: 'FINDER_ACCESS', label: 'تعلیق دسترسی جفت‌یابی' },
          ...(canRestrictAccount ? [{ value: 'ACCOUNT', label: 'محدودکردن کل حساب (ورود بسته)' }] : []),
        ]}
        data-testid="finder-sanction-scope"
      />
      <TextField label="مدت (روز، خالی = تا رفع)" name="days" type="number" ltr data-testid="finder-sanction-days" />
      <TextField label="شناسه گزارش مرتبط (اختیاری)" name="reportId" ltr />
      <div className="sm:col-span-2">
        <TextAreaField label="دلیل" name="reasonFa" rows={2} required maxLength={500} data-testid="finder-sanction-reason" />
      </div>
      <div className="flex flex-wrap items-center gap-md sm:col-span-2">
        <Button type="submit" disabled={pending} data-testid="finder-sanction-submit">
          ثبت محدودیت
        </Button>
        <Result state={state} testId="finder-sanction-result" />
      </div>
    </form>
  );
}

export function LiftSanctionForm({ sanctionId }: { sanctionId: string }) {
  const [state, submit, pending] = useActionState(liftSanctionAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-xs flex flex-wrap items-end gap-sm">
      <input type="hidden" name="sanctionId" value={sanctionId} />
      <TextField label="دلیل رفع" name="reasonFa" required maxLength={500} />
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'finder-lift-' + sanctionId}>
        رفع
      </Button>
      <Result state={state} testId={'finder-lift-result-' + sanctionId} />
    </form>
  );
}

export function ReconcileForm() {
  const [state, submit, pending] = useActionState(reconcileAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="flex flex-wrap items-center gap-md" data-testid="finder-reconcile-form">
      <Button type="submit" tone="secondary" disabled={pending} data-testid="finder-reconcile">
        اجرای هماهنگ‌سازی
      </Button>
      <Result state={state} testId="finder-reconcile-result" />
    </form>
  );
}
