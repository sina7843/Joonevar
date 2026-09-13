'use client';

import { useActionState, useState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { FileField, TextAreaField, TextField } from '../ui/field.tsx';
import { Result } from './directory-forms.tsx';
import { STUDENT_DECISIONS, STUDENT_DECISION_FA, type StudentDecision } from './professional-profile-model.ts';
import {
  decideStudentCaseAction,
  resubmitStudentApplicationAction,
  submitStudentApplicationAction,
  type StudentState,
} from './student-actions.ts';

const EMPTY: StudentState = {};

interface StudentDefaults {
  readonly displayNameFa?: string | null;
  readonly studentNumber?: string | null;
  readonly universityFa?: string | null;
}

/**
 * The student application, or its correction when `correction` is given.
 * Student number and university are required; the card is optional and private.
 */
export function StudentApplicationForm({
  defaults,
  correction,
}: {
  defaults: StudentDefaults;
  correction?: { caseId: string; version: number };
}) {
  const [state, submit, pending] = useActionState(correction ? resubmitStudentApplicationAction : submitStudentApplicationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">{correction ? 'اصلاح پرونده دانشجویی' : 'درخواست احراز دانشجوی دامپزشکی'}</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        حساب کاربری شما همان حساب عادی می‌ماند. پس از بررسی دستی انجمن، فقط Tag «دانشجوی دامپزشکی» اضافه می‌شود؛ دسترسی دکتر، پروانه یا
        دامپزشک معتمد با این مسیر داده نمی‌شود.
      </p>
      <form action={submit} className="mt-lg space-y-md" data-testid={correction ? 'student-correction-form' : 'student-application-form'}>
        {correction ? (
          <>
            <input type="hidden" name="caseId" value={correction.caseId} />
            <input type="hidden" name="expectedVersion" value={correction.version} />
          </>
        ) : null}
        <TextField label="نام و نام خانوادگی" name="displayNameFa" required maxLength={120} defaultValue={defaults.displayNameFa ?? ''} data-testid="student-name" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField
            label="شماره دانشجویی"
            name="studentNumber"
            required
            ltr
            maxLength={20}
            defaultValue={defaults.studentNumber ?? ''}
            hint="همان شماره‌ای که روی کارت دانشجویی آمده است."
            data-testid="student-number"
          />
          <TextField label="دانشگاه" name="universityFa" required maxLength={120} defaultValue={defaults.universityFa ?? ''} data-testid="student-university" />
        </div>
        <FileField
          label="کارت دانشجویی یا گواهی اشتغال به تحصیل (اختیاری)"
          name="studentCard"
          accept="image/jpeg,image/png,application/pdf"
          maxBytes={10 * 1024 * 1024}
          testId="student-card"
        />
        <p className="text-caption text-text-secondary">مدرک خصوصی است و فقط شما و ادمین انجمن آن را می‌بینید؛ هر مشاهده ثبت می‌شود.</p>
        <Button type="submit" disabled={pending} data-testid={correction ? 'resubmit-student' : 'submit-student'}>
          {pending ? 'در حال ارسال…' : correction ? 'ارسال اصلاحات' : 'ارسال برای بررسی'}
        </Button>
        <Result state={state} testId="student-result" />
      </form>
    </Card>
  );
}

/** The association admin's decision. Every decision carries a reason the applicant will read. */
export function DecideStudentCaseForm({ caseId, version }: { caseId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideStudentCaseAction, EMPTY);
  const [decision, setDecision] = useState<StudentDecision>('VERIFY');
  return (
    <form action={submit} className="space-y-lg" data-testid="student-decision-form">
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <fieldset className="space-y-sm">
        <legend className="text-label-md">نتیجه بررسی</legend>
        {STUDENT_DECISIONS.map((value) => (
          <label key={value} className="flex items-center gap-sm text-body-sm">
            <input
              type="radio"
              name="decision"
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
              className="size-[var(--size-selection-md)]"
              data-testid={'student-decision-' + value}
            />
            {STUDENT_DECISION_FA[value]}
          </label>
        ))}
      </fieldset>
      <TextAreaField label="دلیل" name="reasonFa" required rows={3} maxLength={1000} hint="دلیل برای متقاضی نمایش داده می‌شود." data-testid="student-decision-reason" />
      <Button type="submit" disabled={pending} data-testid="submit-student-decision">
        {pending ? 'در حال ثبت…' : 'ثبت نتیجه'}
      </Button>
      <Result state={state} testId="student-decision-result" />
    </form>
  );
}
