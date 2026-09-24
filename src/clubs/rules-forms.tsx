'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import {
  CLUB_RULE_KINDS,
  RULE_KIND_FA,
  RULE_STAGE,
  VET_STATUSES,
  VET_STATUS_FA,
  type ClubRuleKind,
} from './rules-model.ts';
import {
  applyToClubAction,
  decideClubMembershipAction,
  leaveClubAction,
  publishClubRulesAction,
  reevaluateClubMembersAction,
  saveClubRulesAction,
  setClubMembershipStandingAction,
  startClubFeeAction,
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

export interface RuleEditorValue {
  readonly kind: ClubRuleKind;
  readonly chosen: boolean;
  readonly alternative: boolean;
  readonly minCount?: number;
  readonly breedId?: string | null;
  readonly vetStatus?: string;
}

/**
 * The rule editor. It offers the fixed list of questions and their few
 * parameters — never a free expression — and the server rebuilds the tree from
 * exactly these fields.
 */
export function ClubRulesForm({
  clubId,
  values,
  breeds,
  terms,
}: {
  clubId: string;
  values: readonly RuleEditorValue[];
  breeds: ReadonlyArray<{ value: string; label: string }>;
  terms: { termsFa: string | null; termsVersion: string | null; feeToman: string | null; membershipDays: string | null; noteFa: string | null };
}) {
  const [state, submit, pending] = useActionState(saveClubRulesAction, EMPTY);
  const valueOf = (kind: ClubRuleKind) => values.find((row) => row.kind === kind);

  return (
    <form onSubmit={submitWith(submit)} className="space-y-lg" data-testid="club-rules-form">
      <Hidden surface="owner" clubId={clubId} />

      <fieldset className="space-y-md">
        <legend className="text-label-lg">شرط‌های عضویت</legend>
        <p className="text-body-sm text-text-secondary">
          فقط شرط‌های فهرست‌شده پشتیبانی می‌شوند. هر شرطی که «یکی از این‌ها کافی است» را بزنید، در یک گروه اختیاری قرار می‌گیرد.
        </p>
        <ul className="space-y-sm">
          {CLUB_RULE_KINDS.map((kind) => {
            const value = valueOf(kind);
            return (
              <li key={kind} className="rounded-md border border-border-subtle p-md">
                <label className="flex items-center gap-sm text-body-sm">
                  <input
                    type="checkbox"
                    name="rule"
                    value={kind}
                    defaultChecked={value?.chosen ?? false}
                    className="size-[18px]"
                    data-testid={'club-rule-' + kind}
                  />
                  {RULE_KIND_FA[kind]}
                  <span className="text-caption text-text-secondary">
                    {RULE_STAGE[kind] === 'FACT' ? '(شرط واقعیت)' : '(مرحله عضویت)'}
                  </span>
                </label>
                <label className="mt-xs flex items-center gap-sm text-caption text-text-secondary">
                  <input
                    type="checkbox"
                    name="anyOf"
                    value={kind}
                    defaultChecked={value?.alternative ?? false}
                    className="size-[16px]"
                    data-testid={'club-rule-any-' + kind}
                  />
                  یکی از این‌ها کافی است
                </label>

                {kind === 'OWNS_DOG' ? (
                  <div className="mt-sm grid gap-sm sm:grid-cols-2">
                    <TextField
                      label="حداقل تعداد"
                      name="ownsDogMin"
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={value?.minCount ?? 1}
                      data-testid="club-rule-dog-min"
                    />
                    <SelectField
                      label="نژاد (اختیاری)"
                      name="ownsDogBreed"
                      defaultValue={value?.breedId ?? ''}
                      placeholder="هر نژادی"
                      options={breeds}
                      data-testid="club-rule-dog-breed"
                    />
                  </div>
                ) : null}
                {kind === 'PEDIGREE' ? (
                  <div className="mt-sm">
                    <TextField label="حداقل تعداد" name="pedigreeMin" type="number" min={1} max={20} defaultValue={value?.minCount ?? 1} data-testid="club-rule-pedigree-min" />
                  </div>
                ) : null}
                {kind === 'MICROCHIP' ? (
                  <div className="mt-sm">
                    <TextField label="حداقل تعداد" name="microchipMin" type="number" min={1} max={20} defaultValue={value?.minCount ?? 1} data-testid="club-rule-microchip-min" />
                  </div>
                ) : null}
                {kind === 'VET_STATUS' ? (
                  <div className="mt-sm">
                    <SelectField
                      label="وضعیت لازم"
                      name="vetStatus"
                      defaultValue={value?.vetStatus ?? 'LICENSED'}
                      placeholder="انتخاب کنید"
                      options={VET_STATUSES.map((status) => ({ value: status, label: VET_STATUS_FA[status] }))}
                      data-testid="club-rule-vet-status"
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset className="space-y-md">
        <legend className="text-label-lg">شرایط، حق عضویت و مدت</legend>
        <TextAreaField label="متن شرایط کلاب" name="termsFa" rows={4} maxLength={4000} defaultValue={terms.termsFa ?? ''} data-testid="club-terms-text" />
        <TextField label="نسخه شرایط" name="termsVersion" maxLength={40} defaultValue={terms.termsVersion ?? ''} hint="مثلاً c1؛ پذیرش عضو روی همین نسخه ثبت می‌شود." data-testid="club-terms-version" />
        <TextField label="حق عضویت (تومان)" name="feeToman" ltr maxLength={12} defaultValue={terms.feeToman ?? ''} data-testid="club-fee" />
        <TextField label="مدت عضویت (روز)" name="membershipDays" ltr maxLength={4} defaultValue={terms.membershipDays ?? ''} hint="خالی یعنی عضویت خودبه‌خود منقضی نمی‌شود." data-testid="club-membership-days" />
        <TextField label="یادداشت این نسخه" name="noteFa" maxLength={500} defaultValue={terms.noteFa ?? ''} data-testid="club-rules-note" />
      </fieldset>

      <Result state={state} testId="club-rules-result" />
      <Button type="submit" disabled={pending} data-testid="club-rules-save">
        ذخیره پیش‌نویس شرایط
      </Button>
    </form>
  );
}

export function ClubRulesPublishForm({ clubId, ruleVersionId, version }: { clubId: string; ruleVersionId: string; version: number }) {
  const [state, submit, pending] = useActionState(publishClubRulesAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-rules-publish-form">
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="ruleVersionId" value={ruleVersionId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId="club-rules-publish-result" />
      <Button type="submit" disabled={pending} data-testid="club-rules-publish">
        انتشار این نسخه
      </Button>
    </form>
  );
}

export function ClubReevaluateForm({ clubId, activeMembers }: { clubId: string; activeMembers: number }) {
  const [state, submit, pending] = useActionState(reevaluateClubMembersAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-reevaluate-form">
      <Hidden surface="owner" clubId={clubId} />
      <Alert tone="warning" title="بازبینی اعضای کنونی با شرایط تازه">
        {'اعضای فعلی تا وقتی این کار را انجام ندهید، با همان نسخه‌ای که با آن پذیرفته شده‌اند سنجیده می‌شوند. اکنون ' +
          activeMembers.toLocaleString('fa-IR') +
          ' عضو فعال دارید.'}
      </Alert>
      <TextField label="دلیل بازبینی" name="reasonFa" required maxLength={500} data-testid="club-reevaluate-reason" />
      <Result state={state} testId="club-reevaluate-result" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="club-reevaluate-submit">
        اجرای بازبینی
      </Button>
    </form>
  );
}

export function ClubApplyForm({
  clubId,
  termsFa,
  termsVersion,
  disabled,
}: {
  clubId: string;
  termsFa: string | null;
  termsVersion: string | null;
  disabled: boolean;
}) {
  const [state, submit, pending] = useActionState(applyToClubAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-apply-form">
      <Hidden surface="member" clubId={clubId} />
      {termsVersion ? <input type="hidden" name="acceptTermsVersion" value={termsVersion} /> : null}
      {termsFa ? (
        <div className="rounded-md border border-border-subtle bg-bg-subtle p-md text-body-sm" data-testid="club-terms">
          <p className="whitespace-pre-line">{termsFa}</p>
          <p className="mt-sm text-caption text-text-secondary">{'با ارسال درخواست، نسخه ' + termsVersion + ' این شرایط را می‌پذیرید.'}</p>
        </div>
      ) : null}
      <Result state={state} testId="club-apply-result" />
      <Button type="submit" disabled={pending || disabled} data-testid="club-apply-submit">
        ارسال درخواست عضویت
      </Button>
    </form>
  );
}

/** Opens the club fee checkout and follows the server's own next address. */
export function ClubFeeForm({ clubId, membershipId, amountToman }: { clubId: string; membershipId: string; amountToman: string }) {
  const [state, submit, pending] = useActionState(startClubFeeAction, EMPTY);
  const router = useRouter();
  useEffect(() => {
    if (state.ok && state.redirectTo) router.push(state.redirectTo);
  }, [state, router]);

  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid="club-fee-form">
      <Hidden surface="member" clubId={clubId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <p className="text-body-sm">{'حق عضویت این کلاب: ' + Number(amountToman).toLocaleString('fa-IR') + ' تومان'}</p>
      <Result state={state} testId="club-fee-result" />
      <Button type="submit" disabled={pending} data-testid="club-fee-submit">
        پرداخت حق عضویت
      </Button>
    </form>
  );
}

export function ClubLeaveForm({ clubId, membershipId, version }: { clubId: string; membershipId: string; version: number }) {
  const [state, submit, pending] = useActionState(leaveClubAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-sm" data-testid="club-leave-form">
      <Hidden surface="member" clubId={clubId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <Result state={state} testId="club-leave-result" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="club-leave-submit">
        خروج از این کلاب
      </Button>
    </form>
  );
}

export function ClubMembershipDecisionForm({ clubId, membershipId, version }: { clubId: string; membershipId: string; version: number }) {
  const [state, submit, pending] = useActionState(decideClubMembershipAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-md" data-testid={'club-membership-decision-' + membershipId}>
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <TextField label="دلیل تصمیم" name="reasonFa" required maxLength={500} data-testid={'club-membership-reason-' + membershipId} />
      <Result state={state} testId={'club-membership-result-' + membershipId} />
      <div className="flex flex-wrap gap-sm">
        <Button type="submit" name="approve" value="true" disabled={pending} data-testid={'club-membership-approve-' + membershipId}>
          پذیرش عضویت
        </Button>
        <Button type="submit" tone="secondary" name="approve" value="false" disabled={pending} data-testid={'club-membership-reject-' + membershipId}>
          رد درخواست
        </Button>
      </div>
    </form>
  );
}

export function ClubMemberStandingForm({
  clubId,
  membershipId,
  version,
  to,
}: {
  clubId: string;
  membershipId: string;
  version: number;
  to: 'SUSPENDED' | 'ACTIVE';
}) {
  const [state, submit, pending] = useActionState(setClubMembershipStandingAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="space-y-sm" data-testid={'club-member-standing-' + membershipId}>
      <Hidden surface="owner" clubId={clubId} />
      <input type="hidden" name="membershipId" value={membershipId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="to" value={to} />
      <TextField label="دلیل" name="reasonFa" required maxLength={500} data-testid={'club-member-standing-reason-' + membershipId} />
      <Result state={state} testId={'club-member-standing-result-' + membershipId} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'club-member-standing-submit-' + membershipId}>
        {to === 'SUSPENDED' ? 'تعلیق عضویت' : 'برداشتن تعلیق'}
      </Button>
    </form>
  );
}
