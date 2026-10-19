import Link from 'next/link';
import { Card } from '../ui/card.tsx';
import { Alert } from '../ui/alert.tsx';
import { EmptyState } from '../ui/states.tsx';
import { StatusBadge, type StatusTone } from '../ui/status.tsx';
import { formatCivilDateFa } from '../domain/calendar.ts';
import { packagePurchaseEligibility } from '../vets/directory-model.ts';
import type { VetPublicStatus } from '../vets/directory-model.ts';
import type { LicenceStatusName } from '../centres/model.ts';
import type { CommunityEditorData } from './service.ts';
import {
  COMMUNITY_KIND_FA,
  COMMUNITY_SCOPE_FA,
  type CommunityEventStatus,
  type CommunityKind,
  type CommunityScope,
} from './model.ts';
import type { CommunitySurface } from './actions.ts';
import {
  CommunityOwnerForm,
  CommunityProfileForm,
  CommunityPublisherForm,
  CommunityRegistrationForm,
  CommunityStatusForm,
  EventForm,
  ManagerInviteForm,
  ManagerRemoveForm,
  PostCreateForm,
  PostEditForm,
  PostStatusForm,
  type EditableCommunity,
} from './forms.tsx';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const dateFa = (value: string): string => formatCivilDateFa(value as never);

export interface CommunityPost {
  readonly id: string;
  readonly slug: string;
  readonly titleFa: string;
  readonly summaryFa: string;
  readonly bodyFa: string;
  readonly status: string;
  readonly version: number;
  readonly moderationNote: string | null;
  readonly correctionNote: string | null;
}

/** Manager values that differ from the status-dictionary key; the rest are the key. */
const managerKey = (status: string): string => (status === 'INVITED' ? 'PROPOSED' : status);

/** `status`: a status-dictionary key, or — only for a value with no key (GAPS #4) — tone + value. */
function Axis({
  label,
  status,
  detail,
  testId,
}: {
  label: string;
  status: string | { tone: StatusTone; value: string };
  detail?: string;
  testId: string;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-sm border-b border-border-subtle py-sm last:border-b-0" data-testid={testId}>
      <div className="min-w-0">
        <p className="text-label-md">{label}</p>
        {detail ? <p className="mt-2xs text-caption text-text-secondary">{detail}</p> : null}
      </div>
      {typeof status === 'string' ? <StatusBadge status={status} /> : <StatusBadge tone={status.tone}>{status.value}</StatusBadge>}
    </li>
  );
}

/**
 * One association or club, edited by its manager, the review operator or the
 * superadmin — Requirements-Phase-2 §11, §21 (PROMPT-010). The status axes are
 * shown one by one and never summed (P2-D05).
 */
export function CommunityEditor({
  data,
  surface,
  posts = [],
}: {
  data: CommunityEditorData;
  surface: CommunitySurface;
  posts?: readonly CommunityPost[];
}) {
  const { facts, completeness, blockers, posting, reference } = data;
  const { community } = facts;
  const kind = community.kind as CommunityKind;
  const purchase = packagePurchaseEligibility({ accountId: community.ownerAccountId });
  const editable: EditableCommunity = {
    id: community.id,
    version: community.version,
    kind,
    displayNameFa: community.displayNameFa,
    aboutFa: community.aboutFa,
    scope: community.scope,
    provinceCode: community.provinceCode,
    cityId: community.cityId,
    membershipInfoFa: community.membershipInfoFa,
    membershipUrl: community.membershipUrl,
    contactPhone: community.contactPhone,
    websiteUrl: community.websiteUrl,
    registrationNumber: community.registrationNumber,
    licenceStatus: community.licenceStatus as LicenceStatusName,
    publicStatus: community.publicStatus as VetPublicStatus,
    hiddenByReview: community.hiddenByReview,
    canPublishPosts: community.canPublishPosts,
    ownerAccountId: community.ownerAccountId,
    speciesCodes: facts.speciesCodes,
    breedIds: facts.breedIds,
  };
  const canEditContent = surface !== 'review';

  return (
    <div className="space-y-lg">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h2 className="hz-h3">{community.displayNameFa}</h2>
            <p className="mt-2xs text-caption text-text-secondary">
              {COMMUNITY_KIND_FA[kind] + ' · حوزه ' + COMMUNITY_SCOPE_FA[community.scope as CommunityScope]}
            </p>
          </div>
          <span data-testid="community-public-status">
            <StatusBadge status={community.publicStatus} />
          </span>
        </div>
        {community.publicStatus === 'PUBLISHED' && community.publicSlug ? (
          <p className="mt-sm text-body-sm">
            <Link href={'/associations/' + community.publicSlug} className="hz-link hz-link--standalone" data-testid="community-public-link">
              مشاهده صفحه عمومی
            </Link>
          </p>
        ) : null}

        <ul className="mt-lg" data-testid="community-axes">
          <Axis
            testId="community-axis-completeness"
            label="تکمیل پروفایل"
            // GAPS #4: a count, not a lifecycle status
            status={{ tone: completeness.complete ? 'success' : 'neutral', value: fa(completeness.done) + ' از ' + fa(completeness.total) }}
            detail={completeness.missing.length > 0 ? 'مانده: ' + completeness.missing.join('، ') : undefined}
          />
          <Axis
            testId="community-axis-ownership"
            label="مالکیت"
            // GAPS #4: no dictionary key for the ownership axis (OWNED / UNOWNED)
            status={{ tone: community.ownerAccountId ? 'info' : 'warning', value: community.ownerAccountId ? 'دارای مدیر' : 'بدون مالک' }}
            detail={community.claimedAt ? 'واگذاری ثبت‌شده' : 'تا واگذاری، این پرونده مدیری ندارد.'}
          />
          <Axis
            testId="community-axis-registration"
            label={kind === 'ASSOCIATION' ? 'تأیید ثبت و مجوز' : 'مجوز'}
            status={community.licenceStatus}
            detail={kind === 'CLUB' ? 'کلاب مجوز ثبتی ندارد؛ این محور برای انجمن است.' : undefined}
          />
          <Axis
            testId="community-axis-publisher"
            label="ناشر مجاز"
            status={community.canPublishPosts ? 'ACTIVE' : 'INACTIVE'}
            detail="مجوز انتشار مستقیم نوشته را فقط سوپرادمین می‌دهد و مجوز ثبتی یا تبلیغات آن را نمی‌سازد."
          />
          <Axis
            testId="community-axis-advertising"
            label="تبلیغات"
            // GAPS #4: no dictionary key for «no active package»
            status={{ tone: 'neutral', value: 'بسته فعالی ندارد' }}
            detail={purchase.allowed ? 'هیچ بسته‌ای مجوز یا تأیید نمی‌سازد.' : purchase.reasonFa}
          />
        </ul>
      </Card>

      <CommunityStatusForm surface={surface} community={editable} blockers={blockers} />
      {canEditContent ? (
        <CommunityProfileForm
          surface={surface}
          community={editable}
          provinces={reference.provinces}
          cities={reference.cities}
          speciesList={reference.species}
          breeds={reference.breeds}
        />
      ) : null}
      {surface === 'owner' ? null : <CommunityRegistrationForm surface={surface} community={editable} />}
      {surface === 'admin' ? (
        <>
          {kind === 'CLUB' ? <CommunityPublisherForm community={editable} /> : null}
          {community.ownerAccountId === null ? <CommunityOwnerForm community={editable} /> : null}
        </>
      ) : null}

      <Card>
        <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>مدیران</span></h2></div>
        <p className="mt-xs text-body-sm text-text-secondary">نام هر مدیر فقط پس از پذیرش دعوت در صفحه عمومی می‌آید.</p>
        {facts.managers.length === 0 ? (
          <div className="mt-lg">
            <EmptyState title="مدیری ثبت نشده است" description="با شماره موبایل حساب، دعوت بفرستید." />
          </div>
        ) : (
          <ul className="mt-lg divide-y divide-border-subtle" data-testid="community-managers">
            {facts.managers.map((manager) => (
              <li key={manager.id} className="py-md first:pt-0 last:pb-0" data-testid={'community-manager-' + manager.id}>
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <div className="min-w-0">
                    <p className="text-label-md">{manager.nameFa ?? 'بدون پروفایل هویتی'}</p>
                    {manager.roleFa ? <p className="text-caption text-text-secondary">{manager.roleFa}</p> : null}
                  </div>
                  <StatusBadge status={managerKey(manager.status)} />
                </div>
                {canEditContent && manager.status !== 'REMOVED' ? (
                  <ManagerRemoveForm surface={surface} manager={{ id: manager.id, version: manager.version }} />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEditContent ? <ManagerInviteForm surface={surface} communityId={community.id} /> : null}
      </Card>

      <Card>
        <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>رویدادها</span></h2></div>
        <p className="mt-xs text-body-sm text-text-secondary">
          تاریخ‌ها همان‌اند که ثبت می‌کنید؛ همزیست ثبت‌نام یا جای رویداد را تضمین نمی‌کند. رویداد لغوشده با دلیلش می‌ماند.
        </p>
        {facts.events.length === 0 ? (
          <div className="mt-lg">
            <EmptyState title="رویدادی ثبت نشده است" description="با فرم پایین، اولین رویداد را اضافه کنید." />
          </div>
        ) : (
          <ul className="mt-lg divide-y divide-border-subtle">
            {facts.events.map((event) => (
              <li key={event.id} className="py-lg first:pt-0 last:pb-0" data-testid={'community-event-' + event.id}>
                <div className="flex flex-wrap items-start justify-between gap-sm">
                  <div className="min-w-0">
                    <h3 className="text-label-md">{event.titleFa}</h3>
                    <p className="mt-2xs text-caption text-text-secondary">
                      {dateFa(event.startsOn) + (event.endsOn ? ' تا ' + dateFa(event.endsOn) : '') + (event.placeFa ? ' · ' + event.placeFa : '')}
                    </p>
                  </div>
                  <StatusBadge status={event.status} />
                </div>
                {canEditContent ? (
                  <EventForm
                    surface={surface}
                    communityId={community.id}
                    event={{
                      id: event.id,
                      version: event.version,
                      titleFa: event.titleFa,
                      startsOn: event.startsOn,
                      endsOn: event.endsOn,
                      cityId: event.cityId,
                      provinceCode: null,
                      placeFa: event.placeFa,
                      descriptionFa: event.descriptionFa,
                      registrationUrl: event.registrationUrl,
                      status: event.status as CommunityEventStatus,
                      cancelReasonFa: event.cancelReasonFa,
                    }}
                    provinces={reference.provinces}
                    cities={reference.cities}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {canEditContent ? (
          <div className="mt-lg border-t border-border-subtle pt-lg">
            <h3 className="text-label-md">افزودن رویداد</h3>
            <EventForm surface={surface} communityId={community.id} provinces={reference.provinces} cities={reference.cities} />
          </div>
        ) : null}
      </Card>

      {kind === 'CLUB' && canEditContent ? (
        <Card>
          <div className="hz-section-header hz-section-header--sm"><h2 className="hz-section-header__title"><span className="hz-section-header__bar" aria-hidden="true" /><span>نوشته‌های کلاب</span></h2></div>
          {posting ? (
            <div className="mt-md" data-testid="community-posting-blocked">
              <Alert tone="info" title="انتشار مستقیم فعال نیست">
                {posting}
              </Alert>
            </div>
          ) : (
            <>
              {posts.length === 0 ? (
                <div className="mt-lg">
                  <EmptyState title="نوشته‌ای ثبت نشده است" description="با فرم پایین، اولین پیش‌نویس را بسازید." />
                </div>
              ) : (
                <ul className="mt-lg divide-y divide-border-subtle" data-testid="community-posts">
                  {posts.map((post) => (
                    <li key={post.id} className="py-lg first:pt-0 last:pb-0" data-testid={'community-post-' + post.id}>
                      <div className="flex flex-wrap items-start justify-between gap-sm">
                        <h3 className="text-label-md">{post.titleFa}</h3>
                        <StatusBadge status={post.status} />
                      </div>
                      {post.moderationNote ? (
                        <div className="mt-sm" data-testid={'post-moderation-' + post.id}>
                          <Alert tone="warning" title="یادداشت ادمین محتوا">
                            {post.moderationNote}
                          </Alert>
                        </div>
                      ) : null}
                      {post.correctionNote ? (
                        <div className="mt-sm">
                          <Alert tone="info" title="درخواست اصلاح">
                            {post.correctionNote}
                          </Alert>
                        </div>
                      ) : null}
                      {post.status === 'HIDDEN' || post.status === 'DELETED' ? null : (
                        <>
                          <PostEditForm surface={surface} post={post} />
                          <PostStatusForm surface={surface} post={{ id: post.id, version: post.version, status: post.status }} />
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-lg border-t border-border-subtle pt-lg">
                <h3 className="text-label-md">نوشته تازه</h3>
                <PostCreateForm surface={surface} communityId={community.id} />
              </div>
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
