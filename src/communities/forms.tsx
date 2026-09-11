'use client';

import { useActionState } from 'react';
import { Card } from '../ui/card.tsx';
import { Button } from '../ui/button.tsx';
import { Alert } from '../ui/alert.tsx';
import { SelectField, TextAreaField, TextField } from '../ui/field.tsx';
import { Check, PlacePicker, Result, submitWith, type CityOption, type Option } from '../vets/directory-forms.tsx';
import { LICENCE_STATUSES, LICENCE_STATUS_FA, type LicenceStatusName } from '../centres/model.ts';
import { VET_PUBLIC_STATUS_FA, type VetPublicStatus } from '../vets/directory-model.ts';
import {
  COMMUNITY_KINDS,
  COMMUNITY_KIND_FA,
  COMMUNITY_SCOPES,
  COMMUNITY_SCOPE_FA,
  EVENT_STATUS_FA,
  type CommunityEventStatus,
  type CommunityKind,
} from './model.ts';
import {
  addCommunityEventAction,
  assignCommunityOwnerAction,
  changeCommunityPostStatusAction,
  changeCommunityStatusAction,
  createCommunityAction,
  createCommunityPostAction,
  inviteCommunityManagerAction,
  removeCommunityManagerAction,
  respondToCommunityInvitationAction,
  setCommunityPublisherAction,
  setCommunityRegistrationAction,
  updateCommunityEventAction,
  updateCommunityPostAction,
  updateCommunityProfileAction,
  type CommunityFormState,
  type CommunitySurface,
} from './actions.ts';

const EMPTY: CommunityFormState = {};

const Hidden = ({ surface, communityId }: { surface: CommunitySurface; communityId?: string }) => (
  <>
    <input type="hidden" name="surface" value={surface} />
    {communityId ? <input type="hidden" name="communityId" value={communityId} /> : null}
  </>
);

function ReasonField({ surface, testId }: { surface: CommunitySurface; testId: string }) {
  return surface === 'owner' ? (
    <TextField label="یادداشت تغییر" name="reason" maxLength={500} data-testid={testId} />
  ) : (
    <TextField label="دلیل تغییر" name="reason" required maxLength={500} hint="در تاریخچه تغییرات ثبت می‌شود." data-testid={testId} />
  );
}

export interface EditableCommunity {
  readonly id: string;
  readonly version: number;
  readonly kind: CommunityKind;
  readonly displayNameFa: string;
  readonly aboutFa: string | null;
  readonly scope: string;
  readonly provinceCode: string | null;
  readonly cityId: string | null;
  readonly membershipInfoFa: string | null;
  readonly membershipUrl: string | null;
  readonly contactPhone: string | null;
  readonly websiteUrl: string | null;
  readonly registrationNumber: string | null;
  readonly licenceStatus: LicenceStatusName;
  readonly publicStatus: VetPublicStatus;
  readonly hiddenByReview: boolean;
  readonly canPublishPosts: boolean;
  readonly ownerAccountId: string | null;
  readonly speciesCodes: readonly string[];
  readonly breedIds: readonly string[];
}

export function CommunityCreateForm({ surface }: { surface: CommunitySurface }) {
  const [state, submit, pending] = useActionState(createCommunityAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">ثبت انجمن یا کلاب تازه</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        رکورد تازه پیش‌نویس است و تا نوشتن معرفی و راه ارتباطی منتشر نمی‌شود. انجمن ساختار رسمی یا صنفی است و کلاب اجتماع تخصصی،
        نژادی، شهری یا ورزشی.
      </p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="community-create-form">
        <Hidden surface={surface} />
        <Result state={state} testId="community-create-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام" name="displayNameFa" required maxLength={160} data-testid="community-name" />
          <SelectField
            label="نوع"
            name="kind"
            required
            defaultValue="ASSOCIATION"
            options={COMMUNITY_KINDS.map((kind) => ({ value: kind, label: COMMUNITY_KIND_FA[kind] }))}
            data-testid="community-kind"
          />
        </div>
        <SelectField
          label="حوزه"
          name="scope"
          required
          defaultValue="OTHER"
          options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))}
          data-testid="community-scope"
        />
        <TextField label="منبع اطلاعات" name="sourceFa" maxLength={300} hint="فقط برای بررسی؛ عمومی نمایش داده نمی‌شود." data-testid="community-source" />
        <ReasonField surface={surface} testId="community-create-reason" />
        <Check name="confirmedNotDuplicate" label="رکوردهای هم‌نام را دیده‌ام و این مورد تکراری نیست" defaultChecked={false} testId="community-confirm" />
        <Button type="submit" disabled={pending} data-testid="create-community">
          ثبت
        </Button>
      </form>
    </Card>
  );
}

export function CommunityProfileForm({
  surface,
  community,
  provinces,
  cities,
  speciesList,
  breeds,
}: {
  surface: CommunitySurface;
  community: EditableCommunity;
  provinces: readonly Option[];
  cities: readonly CityOption[];
  speciesList: readonly Option[];
  breeds: readonly Option[];
}) {
  const [state, submit, pending] = useActionState(updateCommunityProfileAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">پرونده</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-lg" data-testid="community-profile-form">
        <Hidden surface={surface} communityId={community.id} />
        <input type="hidden" name="expectedVersion" value={community.version} />
        <Result state={state} testId="community-profile-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="نام" name="displayNameFa" required maxLength={160} defaultValue={community.displayNameFa} data-testid="community-profile-name" />
          <SelectField
            label="حوزه"
            name="scope"
            required
            defaultValue={community.scope}
            options={COMMUNITY_SCOPES.map((scope) => ({ value: scope, label: COMMUNITY_SCOPE_FA[scope] }))}
            data-testid="community-profile-scope"
          />
        </div>
        <TextAreaField label="معرفی" name="aboutFa" maxLength={4000} defaultValue={community.aboutFa ?? ''} data-testid="community-about" />
        <PlacePicker
          provinces={provinces}
          cities={cities}
          defaultProvince={community.provinceCode}
          defaultCity={community.cityId}
          testIdPrefix="community-"
        />
        <div className="grid gap-md md:grid-cols-2">
          <TextField label="تلفن" name="contactPhone" ltr inputMode="tel" maxLength={20} defaultValue={community.contactPhone ?? ''} data-testid="community-phone" />
          <TextField label="وب‌سایت" name="websiteUrl" ltr maxLength={300} defaultValue={community.websiteUrl ?? ''} data-testid="community-website" />
        </div>
        <TextAreaField
          label="شرایط عضویت"
          name="membershipInfoFa"
          rows={3}
          maxLength={2000}
          defaultValue={community.membershipInfoFa ?? ''}
          hint="عضویت بیرون از همزیست انجام می‌شود؛ اینجا فقط شرایط و مسیر آن نوشته می‌شود."
          data-testid="community-membership"
        />
        <TextField label="نشانی عضویت" name="membershipUrl" ltr maxLength={300} defaultValue={community.membershipUrl ?? ''} data-testid="community-membership-url" />

        <fieldset>
          <legend className="text-label-md">گونه‌های مرتبط</legend>
          <div className="mt-sm flex flex-wrap gap-lg">
            {speciesList.map((row) => (
              <Check
                key={row.code}
                name="species"
                value={row.code}
                label={row.nameFa}
                defaultChecked={community.speciesCodes.includes(row.code)}
                testId={'community-species-' + row.code}
              />
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-label-md">نژادهای مرتبط</legend>
          <div className="mt-sm grid gap-xs sm:grid-cols-2 lg:grid-cols-3">
            {breeds.map((row) => (
              <Check
                key={row.code}
                name="breed"
                value={row.code}
                label={row.nameFa}
                defaultChecked={community.breedIds.includes(row.code)}
                testId={'community-breed-' + row.code}
              />
            ))}
          </div>
        </fieldset>

        <ReasonField surface={surface} testId="community-profile-reason" />
        <Button type="submit" disabled={pending} data-testid="save-community-profile">
          ذخیره پرونده
        </Button>
      </form>
    </Card>
  );
}

/** An association's registration, recorded by whoever checked it — never by its own manager (§11). */
export function CommunityRegistrationForm({ surface, community }: { surface: CommunitySurface; community: EditableCommunity }) {
  const [state, submit, pending] = useActionState(setCommunityRegistrationAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">شماره ثبت و مجوز</h2>
      <p className="mt-xs text-body-sm text-text-secondary">فقط همان چیزی که در مدارک دیده شده است ثبت می‌شود.</p>
      <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="community-registration-form">
        <Hidden surface={surface} communityId={community.id} />
        <input type="hidden" name="expectedVersion" value={community.version} />
        <Result state={state} testId="community-registration-result" />
        <div className="grid gap-md md:grid-cols-2">
          <TextField
            label="شماره ثبت"
            name="registrationNumber"
            ltr
            maxLength={60}
            defaultValue={community.registrationNumber ?? ''}
            data-testid="community-registration-number"
          />
          <SelectField
            label="وضعیت مجوز"
            name="licenceStatus"
            required
            defaultValue={community.licenceStatus}
            options={LICENCE_STATUSES.map((value) => ({ value, label: LICENCE_STATUS_FA[value] }))}
            data-testid="community-licence-status"
          />
        </div>
        <TextField label="دلیل ثبت" name="reason" required maxLength={500} data-testid="community-registration-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="save-community-registration">
          ثبت
        </Button>
      </form>
    </Card>
  );
}

/** «انتشار مستقیم کلاب فقط با مجوز ادمین فعال می‌شود» (§11). */
export function CommunityPublisherForm({ community }: { community: EditableCommunity }) {
  const [state, submit, pending] = useActionState(setCommunityPublisherAction, EMPTY);
  const grant = !community.canPublishPosts;
  return (
    <Card>
      <h2 className="text-label-lg">مجوز انتشار مستقیم</h2>
      <p className="mt-xs text-body-sm text-text-secondary">
        {community.canPublishPosts
          ? 'این کلاب می‌تواند نوشته‌هایش را خودش منتشر کند. ادمین محتوا همچنان می‌تواند نوشته را پنهان یا حذف نرم کند.'
          : 'تا وقتی این مجوز داده نشود، کلاب نوشته‌ای منتشر نمی‌کند.'}
      </p>
      <form key={String(community.canPublishPosts)} onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="community-publisher-form">
        <Hidden surface="admin" communityId={community.id} />
        <input type="hidden" name="expectedVersion" value={community.version} />
        <input type="hidden" name="canPublishPosts" value={grant ? 'GRANT' : 'REVOKE'} />
        <Result state={state} testId="community-publisher-result" />
        <TextField label="دلیل" name="reason" required maxLength={500} data-testid="community-publisher-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="set-community-publisher">
          {grant ? 'دادن مجوز انتشار' : 'برداشتن مجوز انتشار'}
        </Button>
      </form>
    </Card>
  );
}

export function CommunityOwnerForm({ community }: { community: EditableCommunity }) {
  const [state, submit, pending] = useActionState(assignCommunityOwnerAction, EMPTY);
  return (
    <Card>
      <h2 className="text-label-lg">مدیر پرونده</h2>
      <form onSubmit={submitWith(submit)} className="mt-lg grid gap-md md:grid-cols-[1fr_1fr_auto] md:items-end" data-testid="community-owner-form">
        <Hidden surface="admin" communityId={community.id} />
        <input type="hidden" name="expectedVersion" value={community.version} />
        <div className="md:col-span-3">
          <Result state={state} testId="community-owner-result" />
        </div>
        <TextField label="شماره موبایل مدیر" name="mobile" ltr required inputMode="numeric" data-testid="community-owner-mobile" />
        <TextField label="دلیل" name="reason" required maxLength={500} data-testid="community-owner-reason" />
        <Button type="submit" tone="secondary" disabled={pending} data-testid="assign-community-owner">
          واگذاری
        </Button>
      </form>
    </Card>
  );
}

export function CommunityStatusForm({
  surface,
  community,
  blockers,
}: {
  surface: CommunitySurface;
  community: EditableCommunity;
  blockers: readonly string[];
}) {
  const [state, submit, pending] = useActionState(changeCommunityStatusAction, EMPTY);
  const targets: VetPublicStatus[] = community.publicStatus === 'PUBLISHED' ? ['HIDDEN'] : ['PUBLISHED'];
  const lockedForOwner = surface === 'owner' && community.hiddenByReview && community.publicStatus === 'HIDDEN';
  return (
    <Card>
      <h2 className="text-label-lg">انتشار</h2>
      <p className="mt-xs text-body-sm text-text-secondary">{'وضعیت فعلی: ' + VET_PUBLIC_STATUS_FA[community.publicStatus]}</p>
      <Result state={state} testId="community-status-result" />
      {lockedForOwner ? (
        <div className="mt-md" data-testid="community-review-hidden">
          <Alert tone="warning" title="این پرونده در بررسی همزیست پنهان شده است">
            انتشار دوباره فقط از بررسی همزیست ممکن است.
          </Alert>
        </div>
      ) : (
        <>
          {blockers.length > 0 && community.publicStatus !== 'PUBLISHED' ? (
            <div className="mt-md" data-testid="community-blockers">
              <Alert tone="warning" title="پیش از انتشار">
                <ul className="list-disc space-y-2xs pr-lg">
                  {blockers.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Alert>
            </div>
          ) : null}
          <form key={community.publicStatus} onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="community-status-form">
            <Hidden surface={surface} communityId={community.id} />
            <input type="hidden" name="expectedVersion" value={community.version} />
            <SelectField
              label="وضعیت تازه"
              name="to"
              required
              defaultValue={targets[0]}
              options={targets.map((value) => ({ value, label: VET_PUBLIC_STATUS_FA[value] }))}
              data-testid="community-status-to"
            />
            <ReasonField surface={surface} testId="community-status-reason" />
            <Button type="submit" disabled={pending} data-testid="change-community-status">
              ثبت وضعیت
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

export function ManagerInviteForm({ surface, communityId }: { surface: CommunitySurface; communityId: string }) {
  const [state, submit, pending] = useActionState(inviteCommunityManagerAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="manager-invite-form">
      <Hidden surface={surface} communityId={communityId} />
      <Result state={state} testId="manager-invite-result" />
      <div className="grid gap-md md:grid-cols-2">
        <TextField label="شماره موبایل مدیر" name="mobile" ltr required inputMode="numeric" data-testid="manager-mobile" />
        <TextField label="سمت" name="roleFa" maxLength={120} data-testid="manager-role" />
      </div>
      <ReasonField surface={surface} testId="manager-invite-reason" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="invite-manager">
        فرستادن دعوت
      </Button>
    </form>
  );
}

export function ManagerRemoveForm({ surface, manager }: { surface: CommunitySurface; manager: { id: string; version: number } }) {
  const [state, submit, pending] = useActionState(removeCommunityManagerAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid={'manager-remove-form-' + manager.id}>
      <input type="hidden" name="surface" value={surface} />
      <input type="hidden" name="managerId" value={manager.id} />
      <input type="hidden" name="expectedVersion" value={manager.version} />
      <div className="min-w-[12rem] flex-1">
        <ReasonField surface={surface} testId={'manager-remove-reason-' + manager.id} />
      </div>
      <Button type="submit" tone="ghost" disabled={pending} data-testid={'remove-manager-' + manager.id}>
        برداشتن از فهرست
      </Button>
      <div className="w-full">
        <Result state={state} testId={'manager-remove-result-' + manager.id} />
      </div>
    </form>
  );
}

export function CommunityInvitationForm({
  invitation,
}: {
  invitation: { id: string; version: number; communityNameFa: string; roleFa: string | null };
}) {
  const [state, submit, pending] = useActionState(respondToCommunityInvitationAction, EMPTY);
  return (
    <div className="rounded-lg border border-border-subtle p-lg" data-testid={'community-invitation-' + invitation.id}>
      <p className="text-label-md">{invitation.communityNameFa}</p>
      {invitation.roleFa ? <p className="mt-2xs text-caption text-text-secondary">{'سمت پیشنهادی: ' + invitation.roleFa}</p> : null}
      <p className="mt-xs text-body-sm text-text-secondary">تا وقتی نپذیرید، نام شما در صفحه عمومی نمایش داده نمی‌شود.</p>
      <Result state={state} testId={'community-invitation-result-' + invitation.id} />
      <div className="mt-md flex flex-wrap gap-sm">
        {(
          [
            { answer: 'ACCEPT', label: 'پذیرش', tone: 'primary' as const, testId: 'accept-community-invitation-' },
            { answer: 'DECLINE', label: 'رد دعوت', tone: 'ghost' as const, testId: 'decline-community-invitation-' },
          ] as const
        ).map((choice) => (
          <form key={choice.answer} onSubmit={submitWith(submit)}>
            <input type="hidden" name="managerId" value={invitation.id} />
            <input type="hidden" name="expectedVersion" value={invitation.version} />
            <input type="hidden" name="answer" value={choice.answer} />
            <Button type="submit" tone={choice.tone} disabled={pending} data-testid={choice.testId + invitation.id}>
              {choice.label}
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}

// ── Events ───────────────────────────────────────────────────────────────

export interface EditableEvent {
  readonly id: string;
  readonly version: number;
  readonly titleFa: string;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly cityId: string | null;
  readonly provinceCode: string | null;
  readonly placeFa: string | null;
  readonly descriptionFa: string | null;
  readonly registrationUrl: string | null;
  readonly status: CommunityEventStatus;
  readonly cancelReasonFa: string | null;
}

export function EventForm({
  surface,
  communityId,
  event,
  provinces,
  cities,
}: {
  surface: CommunitySurface;
  communityId: string;
  event?: EditableEvent;
  provinces: readonly Option[];
  cities: readonly CityOption[];
}) {
  const [state, submit, pending] = useActionState(event ? updateCommunityEventAction : addCommunityEventAction, EMPTY);
  const suffix = event ? '-' + event.id : '';
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-md" data-testid={event ? 'event-form-' + event.id : 'add-event-form'}>
      <Hidden surface={surface} communityId={communityId} />
      {event ? (
        <>
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="expectedVersion" value={event.version} />
        </>
      ) : null}
      <Result state={state} testId={event ? 'event-result-' + event.id : 'add-event-result'} />
      <TextField label="عنوان رویداد" name="titleFa" required maxLength={160} defaultValue={event?.titleFa ?? ''} data-testid={'event-title' + suffix} />
      <div className="grid gap-md md:grid-cols-2">
        <TextField
          label="تاریخ شروع"
          name="startsOn"
          ltr
          required
          maxLength={10}
          defaultValue={event?.startsOn ?? ''}
          hint="به شکل ۲۰۲۶-۰۳-۲۱ (میلادی)."
          data-testid={'event-starts' + suffix}
        />
        <TextField label="تاریخ پایان" name="endsOn" ltr maxLength={10} defaultValue={event?.endsOn ?? ''} data-testid={'event-ends' + suffix} />
      </div>
      <PlacePicker
        provinces={provinces}
        cities={cities}
        defaultProvince={event?.provinceCode}
        defaultCity={event?.cityId}
        testIdPrefix="event-"
        testIdSuffix={suffix}
      />
      <TextField label="محل برگزاری" name="placeFa" maxLength={200} defaultValue={event?.placeFa ?? ''} data-testid={'event-place' + suffix} />
      <TextAreaField label="توضیح" name="descriptionFa" rows={3} maxLength={4000} defaultValue={event?.descriptionFa ?? ''} data-testid={'event-description' + suffix} />
      <TextField
        label="نشانی ثبت‌نام"
        name="registrationUrl"
        ltr
        maxLength={300}
        defaultValue={event?.registrationUrl ?? ''}
        hint="ثبت‌نام بیرون از همزیست انجام می‌شود."
        data-testid={'event-url' + suffix}
      />
      {event ? (
        <>
          <SelectField
            label="وضعیت"
            name="status"
            required
            defaultValue={event.status}
            options={(['DRAFT', 'PUBLISHED', 'CANCELLED'] as const).map((value) => ({ value, label: EVENT_STATUS_FA[value] }))}
            data-testid={'event-status' + suffix}
          />
          <TextField label="دلیل لغو" name="cancelReasonFa" maxLength={500} defaultValue={event.cancelReasonFa ?? ''} data-testid={'event-cancel-reason' + suffix} />
          <ReasonField surface={surface} testId={'event-reason' + suffix} />
        </>
      ) : (
        <SelectField
          label="وضعیت"
          name="status"
          required
          defaultValue="DRAFT"
          options={(['DRAFT', 'PUBLISHED'] as const).map((value) => ({ value, label: EVENT_STATUS_FA[value] }))}
          data-testid="event-status"
        />
      )}
      <Button type="submit" tone="secondary" disabled={pending} data-testid={event ? 'save-event-' + event.id : 'add-event'}>
        {event ? 'ذخیره رویداد' : 'افزودن رویداد'}
      </Button>
    </form>
  );
}

// ── Club posts ───────────────────────────────────────────────────────────

export function PostCreateForm({ surface, communityId }: { surface: CommunitySurface; communityId: string }) {
  const [state, submit, pending] = useActionState(createCommunityPostAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="post-create-form">
      <Hidden surface={surface} communityId={communityId} />
      <Result state={state} testId="post-create-result" />
      <TextField label="عنوان نوشته" name="titleFa" required maxLength={200} data-testid="post-title" />
      <Check name="confirmDuplicate" label="عنوان تکراری عمدی است" defaultChecked={false} testId="post-confirm-duplicate" />
      <Button type="submit" tone="secondary" disabled={pending} data-testid="create-post">
        ساخت پیش‌نویس
      </Button>
    </form>
  );
}

export function PostEditForm({
  surface,
  post,
}: {
  surface: CommunitySurface;
  post: { id: string; version: number; titleFa: string; summaryFa: string; bodyFa: string; status: string };
}) {
  const [state, submit, pending] = useActionState(updateCommunityPostAction, EMPTY);
  return (
    <form onSubmit={submitWith(submit)} className="mt-md space-y-md" data-testid={'post-form-' + post.id}>
      <Hidden surface={surface} />
      <input type="hidden" name="postId" value={post.id} />
      <input type="hidden" name="expectedVersion" value={post.version} />
      <Result state={state} testId={'post-result-' + post.id} />
      <TextField label="عنوان" name="titleFa" required maxLength={200} defaultValue={post.titleFa} data-testid={'post-title-' + post.id} />
      <TextField label="خلاصه" name="summaryFa" maxLength={500} defaultValue={post.summaryFa} data-testid={'post-summary-' + post.id} />
      <TextAreaField label="متن" name="bodyFa" rows={6} maxLength={20000} defaultValue={post.bodyFa} data-testid={'post-body-' + post.id} />
      <Button type="submit" tone="secondary" disabled={pending} data-testid={'save-post-' + post.id}>
        ذخیره نوشته
      </Button>
    </form>
  );
}

export function PostStatusForm({
  surface,
  post,
}: {
  surface: CommunitySurface;
  post: { id: string; version: number; status: string };
}) {
  const [state, submit, pending] = useActionState(changeCommunityPostStatusAction, EMPTY);
  const targets = post.status === 'PUBLISHED' ? ['DRAFT', 'ARCHIVED'] : post.status === 'ARCHIVED' ? ['PUBLISHED'] : ['PUBLISHED'];
  return (
    <form key={post.status} onSubmit={submitWith(submit)} className="mt-sm flex flex-wrap items-end gap-sm" data-testid={'post-status-form-' + post.id}>
      <Hidden surface={surface} />
      <input type="hidden" name="postId" value={post.id} />
      <input type="hidden" name="expectedVersion" value={post.version} />
      <div className="min-w-[10rem]">
        <SelectField
          label="وضعیت تازه"
          name="to"
          required
          defaultValue={targets[0]}
          options={targets.map((value) => ({ value, label: value === 'PUBLISHED' ? 'انتشار' : value === 'ARCHIVED' ? 'بایگانی' : 'پیش‌نویس' }))}
          data-testid={'post-status-to-' + post.id}
        />
      </div>
      <Button type="submit" disabled={pending} data-testid={'change-post-status-' + post.id}>
        ثبت
      </Button>
      <div className="w-full">
        <Result state={state} testId={'post-status-result-' + post.id} />
      </div>
    </form>
  );
}
