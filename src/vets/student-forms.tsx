'use client';

import { useActionState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { FileField, TextField } from '../ui/field.tsx';
import { Result } from './directory-forms.tsx';
import { STUDENT_DECISIONS, STUDENT_DECISION_DESC_FA, STUDENT_DECISION_FA } from './professional-profile-model.ts';
import { DecisionForm } from '../ui/decision.tsx';
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
      <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>{correction ? 'اصلاح پرونده دانشجویی' : 'درخواست احراز دانشجوی دامپزشکی'}</span></h2></div>
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

/**
 * The association admin's decision on a student (DS P10 panel).
 * The decision service still requires a reason for every outcome (approval
 * included), so the reason is asked for all three; the consequence sits under
 * each label (DS DecisionDesk).
 */
export function DecideStudentCaseForm({ caseId, version }: { caseId: string; version: number }) {
  return (
    <DecisionForm
      action={decideStudentCaseAction}
      hidden={{ caseId, expectedVersion: version }}
      formTestId="student-decision-form"
      submitTestId="submit-student-decision"
      reasonName="reasonFa"
      reasonTestId="student-decision-reason"
      reasonFor={STUDENT_DECISIONS}
      reasonLabel={(value) => (value === 'REJECT' ? 'دلیل رد' : value === 'REQUEST_CORRECTION' ? 'دلیل اصلاح' : 'دلیل تأیید')}
      audience="به متقاضی نمایش داده می‌شود"
      drafts={['تصویر کارت دانشجویی خوانا نیست', 'شماره دانشجویی با کارت نمی‌خواند']}
      choices={STUDENT_DECISIONS.map((value) => ({ value, label: STUDENT_DECISION_FA[value], desc: STUDENT_DECISION_DESC_FA[value], testId: 'student-decision-' + value }))}
    />
  );
}
