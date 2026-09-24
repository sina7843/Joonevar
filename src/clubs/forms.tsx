'use client';

import { useActionState } from 'react';
import { Card, CardHeader } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import { COMMUNITY_SCOPES, COMMUNITY_SCOPE_FA } from '../communities/model.ts';
import { REASON_FA, REPORT_REASONS } from '../moderation/model.ts';
import { CLUB_ROLE_FA, type ClubRole } from './model.ts';
import {
  assignClubRoleAction,
  cancelClubOwnershipAction,
  createClubAction,
  decideClubOwnershipAction,
  decideClubReportsAction,
  decideClubVerificationAction,
  removeClubRoleAction,
  reportClubAction,
  requestClubOwnershipAction,
  setClubPublicationAction,
  setClubStandingAction,
  submitClubAction,
  type ClubFormState,
  type ClubSurface,
} from './actions.ts';

const EMPTY: ClubFormState = {};

const Hidden = ({ surface, clubId }: { surface: ClubSurface; clubId?: string }) => (
  <>
    <input type="hidden" name="surface" value={surface} />
    {clubId ? <input type="hidden" name="clubId" value={clubId} /> : null}
  </>
);

export function ClubCreateForm() {
  const [state, submit, pending] = useActionState(createClubAction, EMPTY);
  return (
    <Card>
      <CardHeader title="ساخت کلاب تازه" subtitle="کلاب به‌صورت پیش‌نویس ساخته می‌شود و تا تأیید انجمن، صفحه عمومی ندارد." />
      <form onSubmit={submitWith(submit)} className="mt-md space-y-md" data-testid="club-create-form">
        <Hidden surface="owner" />
        <TextField label="نام کلاب" name="displayNameFa" required maxLength={160} data-testid="club-name" />
        <SelectField
          label="حوزه فعالیت"
          name="scope"
          defaultValue="OTHER"
          options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))}
          data-testid="club-scope"
        />
        <TextAreaField label="معرفی کلاب" name="aboutFa" rows={4} maxLength={4000} data-testid="club-about" />
        <TextField label="راه ارتباطی" name="contactPhone" ltr maxLength={40} data-testid="club-contact" />
        <Result state={state} testId="club-create-result" />
        <Button type="submit" disabled={pending} data-testid="club-create-submit">
          ساخت کلاب
        </Button>
      </form>
    </Card>
  );
}

export function ClubSubmitForm({ clubId, version, blockers }: { clubId: string; version: number; blockers: readonly string[] }) {
  const [state, submit, pending] = useActionState(submitClubAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-submit-form">
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <TextField label="توضیح برای انجمن" name="noteFa" maxLength={500} data-testid="club-submit-note" />
      {blockers.length > 0 ? (
        <ul className="list-disc space-y-2xs pr-md text-body-sm text-text-secondary" data-testid="club-submit-blockers">
          {blockers.map((blocker) => (
            <li key={blocker}>{blocker}</li>
          ))}
        </ul>
      ) : null}
      <Result state={state} testId="club-submit-result" />
      <Button type="submit" disabled={pending || blockers.length > 0} data-testid="club-submit">
        ارسال برای بررسی انجمن
      </Button>
    </form>
  );
}

export function ClubPublicationForm({ clubId, version, published }: { clubId: string; version: number; published: boolean }) {
  const [state, submit, pending] = useActionState(setClubPublicationAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-publication-form">
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="publish" value={published ? 'false' : 'true'} />
      <TextField label="یادداشت" name="reasonFa" maxLength={500} data-testid="club-publication-note" />
      <Result state={state} testId="club-publication-result" />
      <Button type="submit" tone={published ? 'secondary' : 'primary'} disabled={pending} data-testid="club-publication-submit">
        {published ? 'پنهان‌کردن صفحه عمومی' : 'انتشار صفحه عمومی'}
      </Button>
    </form>
  );
}

export function ClubRoleForm({ clubId, roles }: { clubId: string; roles: readonly ClubRole[] }) {
  const [state, submit, pending] = useActionState(assignClubRoleAction, EMPTY);
  if (roles.length === 0) return null;
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-role-form">
      <Hidden surface="owner" clubId={clubId} />
      <TextField label="شماره موبایل" name="mobile" ltr required maxLength={20} data-testid="club-role-mobile" />
      <SelectField
        label="نقش در همین کلاب"
        name="role"
        required
        options={roles.map((role) => ({ value: role, label: CLUB_ROLE_FA[role] }))}
        hint="این نقش فقط در همین کلاب کار می‌کند."
        data-testid="club-role-select"
      />
      <TextField label="یادداشت" name="reasonFa" maxLength={500} data-testid="club-role-note" />
      <Result state={state} testId="club-role-result" />
      <Button type="submit" disabled={pending} data-testid="club-role-submit">
        ثبت نقش
      </Button>
    </form>
  );
}

export function ClubRoleRemoveForm({ clubId, membershipId, version }: { clubId: string; membershipId: string; version: number }) {
  const [state, submit, pending] = useActionState(removeClubRoleAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-sm" data-testid={'club-role-remove-' + membershipId}>
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId={'club-role-remove-result-' + membershipId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'club-role-remove-submit-' + membershipId}>
        برداشتن نقش
      </Button>
    </form>
  );
}

export function ClubOwnershipRequestForm({ clubId, kind }: { clubId: string; kind: 'CLAIM' | 'TRANSFER' }) {
  const [state, submit, pending] = useActionState(requestClubOwnershipAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid={'club-ownership-' + kind.toLowerCase()}>
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="kind" value={kind} />
      {kind === 'TRANSFER' ? (
        <TextField
          label="شماره موبایل مالک تازه"
          name="targetMobile"
          ltr
          required
          maxLength={20}
          hint="واگذاری پس از تصمیم انجمن اثر می‌گذارد."
          data-testid="club-transfer-mobile"
        />
      ) : null}
      <TextAreaField label="توضیح برای انجمن" name="reasonFa" rows={3} maxLength={500} data-testid={'club-ownership-reason-' + kind.toLowerCase()} />
      <Result state={state} testId={'club-ownership-result-' + kind.toLowerCase()} />
      <Button type="submit" disabled={pending} data-testid={'club-ownership-submit-' + kind.toLowerCase()}>
        {kind === 'CLAIM' ? 'درخواست مالکیت این کلاب' : 'واگذاری مالکیت'}
      </Button>
    </form>
  );
}

export function ClubOwnershipCancelForm({ clubId, requestId, version }: { clubId: string; requestId: string; version: number }) {
  const [state, submit, pending] = useActionState(cancelClubOwnershipAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-sm" data-testid="club-ownership-cancel">
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId="club-ownership-cancel-result" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="club-ownership-cancel-submit">
        پس‌گرفتن درخواست
      </Button>
    </form>
  );
}

export function ClubVerificationDecisionForm({ clubId, version }: { clubId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideClubVerificationAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-verification-form">
      <Hidden surface="assoc" clubId={clubId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <TextAreaField label="دلیل تصمیم" name="reasonFa" rows={3} required maxLength={500} data-testid="club-verification-reason" />
      <Result state={state} testId="club-verification-result" />
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" name="outcome" value="VERIFY" disabled={pending} data-testid="club-verify">
          تأیید کلاب
        </Button>
        <Button type="submit" tone="secondary" name="outcome" value="NEEDS_CORRECTION" disabled={pending} data-testid="club-needs-correction">
          درخواست اصلاح
        </Button>
        <Button type="submit" tone="secondary" name="outcome" value="REJECT" disabled={pending} data-testid="club-reject">
          رد درخواست
        </Button>
      </div>
    </form>
  );
}

export function ClubStandingForm({ clubId, version, surface, to }: { clubId: string; version: number; surface: ClubSurface; to: string }) {
  const [state, submit, pending] = useActionState(setClubStandingAction, EMPTY);
  const labelFa = to === 'SUSPENDED' ? 'تعلیق کلاب' : to === 'ACTIVE' ? 'برداشتن تعلیق' : 'بایگانی کلاب';
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid={'club-standing-' + to.toLowerCase()}>
      <Hidden surface={surface} clubId={clubId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="to" value={to} />
      <TextField label="دلیل" name="reasonFa" required maxLength={500} data-testid={'club-standing-reason-' + to.toLowerCase()} />
      <Result state={state} testId={'club-standing-result-' + to.toLowerCase()} />
      <Button type="submit" tone={to === 'ACTIVE' ? 'primary' : 'secondary'} disabled={pending} data-testid={'club-standing-submit-' + to.toLowerCase()}>
        {labelFa}
      </Button>
    </form>
  );
}

export function ClubOwnershipDecisionForm({ requestId, version }: { requestId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideClubOwnershipAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid={'club-ownership-decision-' + requestId}>
      <Hidden surface="assoc" />
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <TextAreaField label="دلیل تصمیم" name="reasonFa" rows={2} required maxLength={500} data-testid={'club-ownership-decision-reason-' + requestId} />
      <Result state={state} testId={'club-ownership-decision-result-' + requestId} />
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" name="approve" value="true" disabled={pending} data-testid={'club-ownership-approve-' + requestId}>
          تأیید مالکیت
        </Button>
        <Button type="submit" tone="secondary" name="approve" value="false" disabled={pending} data-testid={'club-ownership-reject-' + requestId}>
          رد درخواست
        </Button>
      </div>
    </form>
  );
}

export function ClubReportForm({ clubId }: { clubId: string }) {
  const [state, submit, pending] = useActionState(reportClubAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-report-form">
      <Hidden surface="public" clubId={clubId} />
      <SelectField
        label="دلیل گزارش"
        name="reason"
        required
        options={REPORT_REASONS.map((reason) => ({ value: reason, label: REASON_FA[reason] }))}
        data-testid="club-report-reason"
      />
      <TextAreaField label="توضیح" name="details" rows={3} maxLength={1000} data-testid="club-report-details" />
      <Result state={state} testId="club-report-result" />
      <Button type="submit" disabled={pending} data-testid="club-report-submit">
        ارسال گزارش
      </Button>
    </form>
  );
}

export function ClubModerationForm({ clubId }: { clubId: string }) {
  const [state, submit, pending] = useActionState(decideClubReportsAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid={'club-moderation-' + clubId}>
      <Hidden surface="moderation" clubId={clubId} />
      <TextAreaField label="دلیل تصمیم" name="reasonFa" rows={2} required maxLength={500} data-testid={'club-moderation-reason-' + clubId} />
      <Result state={state} testId={'club-moderation-result-' + clubId} />
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" tone="secondary" name="decision" value="DISMISS" disabled={pending} data-testid={'club-moderation-dismiss-' + clubId}>
          رد گزارش‌ها
        </Button>
        <Button type="submit" name="decision" value="HIDE" disabled={pending} data-testid={'club-moderation-hide-' + clubId}>
          پنهان‌کردن صفحه
        </Button>
        <Button type="submit" tone="secondary" name="decision" value="SOFT_DELETE" disabled={pending} data-testid={'club-moderation-remove-' + clubId}>
          خارج‌کردن از دسترس عمومی
        </Button>
      </div>
    </form>
  );
}
