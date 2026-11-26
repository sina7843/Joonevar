import Link from 'next/link';
import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { StatusBadge } from '../../../src/ui/status.tsx';
import { db } from '../../../src/db/client.ts';
import { formatInstantFa } from '../../../src/content/model.ts';
import { formatTomanFa, configuredMoney } from '../../../src/domain/money.ts';
import { planSlots } from '../../../src/finder/plans.ts';
import { finderFlagEnabled } from '../../../src/finder/flags.ts';
import {
  finderCapacity,
  finderStanding,
  ownerAnimalsForFinder,
  purchasableAudiences,
  subscriptionHistory,
} from '../../../src/finder/subscriptions.ts';
import { FINDER_AUDIENCE_FA, FINDER_DURATION_FA, SUSPENSION_POLICY_FA, type FinderDuration } from '../../../src/finder/model.ts';
import { BuyPlanForm } from '../../../src/finder/forms.tsx';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { KeyValueList } from '../../../src/ui/key-value.tsx';
import { ButtonLink } from '../../../src/ui/button.tsx';
import { Icon } from '../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const price = (value: bigint | null): string => (value === null ? 'قیمت هنوز تعیین نشده' : formatTomanFa(configuredMoney(value.toString()))!);

/**
 * The account's mating-finder subscription — PHASE-4 PROMPT-002.
 *
 * Standing, capacity, plans for the audiences this account may buy, history,
 * and the registered animals that already carry the identity facts a profile
 * will need. Buying opens a payment whose amount the server freezes; the period
 * starts only when the server verifies it.
 */
export default async function MatingFinderAccountPage() {
  const guard = await guardRoute('/account/mating-finder');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;
  const now = new Date();

  const [standing, capacity, slots, audiences, history, animals, purchaseOpen] = await Promise.all([
    finderStanding(db(), actor.accountId, now),
    finderCapacity(db(), actor.accountId, now),
    planSlots(db(), now),
    purchasableAudiences(db(), actor.accountId),
    subscriptionHistory(db(), actor.accountId),
    ownerAnimalsForFinder(db(), actor.accountId),
    finderFlagEnabled(db(), 'finder.flag.subscription_purchase'),
  ]);
  const sellable = slots.filter((slot) => slot.current !== null && audiences.includes(slot.audience));

  return (
    <PublicShell
      actor={actor}
      title="اشتراک جفت‌یابی"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="اشتراک جفت‌یابی"
          back={{ href: '/dashboard' }}
          meta={[
            'اشتراک فقط دسترسی می‌دهد: حیوانات فعال مالک مشترک برای همه دیده می‌شوند و مشترک، حیوانات آماده مالکان بدون اشتراک را هم می‌بیند. برای شکل‌گرفتن درخواست کافی است یکی از دو مالک اشتراک فعال داشته باشد. اشتراک رتبه حیوان را در نتایج بالا نمی‌برد.',
          ]}
          actions={
            <ButtonLink tone="secondary" href="/account/mating-finder/profiles" iconStart="pawPrint">
              پروفایل‌های من
            </ButtonLink>
          }
        />
      }
    >
      <div className="space-y-lg">
        <p className="hz-inline-msg hz-inline-msg--info">
          <Icon name="info" size="xs" />
          <span className="hz-inline-msg__text">پرداخت توافق جفت‌گیری بیرون از همزیست انجام می‌شود؛ همزیست فقط هزینه اشتراک را دریافت می‌کند.</span>
        </p>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <SectionHeader title="وضعیت فعلی" size="sm" />
            <span data-testid="finder-standing">
              <StatusBadge status={standing.state} />
            </span>
          </div>
          <KeyValueList
            twoCol
            rows={[
              ...(standing.current
                ? [{ key: 'پایان دوره فعلی', value: formatInstantFa(standing.current.endsAt), testId: 'finder-current-ends' }]
                : []),
              ...(standing.chainEndsAt && standing.chainEndsAt.getTime() > now.getTime() && standing.chainEndsAt.getTime() !== standing.current?.endsAt.getTime()
                ? [{ key: 'پایان همه دوره‌های پرداخت‌شده', value: formatInstantFa(standing.chainEndsAt) }]
                : []),
              {
                key: 'ظرفیت حیوان فعال',
                testId: 'finder-capacity',
                value:
                  capacity.limit === null
                    ? 'هنوز توسط مدیریت تعیین نشده'
                    : fa(capacity.limit) + (capacity.source === 'PLAN' ? ' (طرح ' + FINDER_AUDIENCE_FA[capacity.audience!] + ')' : ' (حساب بدون اشتراک)'),
              },
            ]}
          />
          {standing.state === 'EXPIRED' ? (
            <div className="mt-md">
              <Alert tone="warning" title="اشتراک منقضی شده است">
                درخواست‌ها و قراردادهای در جریان باطل نمی‌شوند، ولی تا تمدید، فعال‌سازی حیوان تازه و ارسال درخواست تازه
                فقط در حد ظرفیت حساب بدون اشتراک ممکن است.
              </Alert>
            </div>
          ) : null}
        </Card>

        <Card>
          <SectionHeader title={standing.state === 'ACTIVE' ? 'تمدید' : 'خرید اشتراک'} size="sm" />
          {standing.state === 'ACTIVE' ? (
            <p className="mt-xs text-caption text-text-secondary">تمدید زودهنگام روزهای باقی‌مانده را حفظ می‌کند: دوره تازه از پایان دوره فعلی شروع می‌شود.</p>
          ) : null}
          {!purchaseOpen ? (
            <div className="mt-md" data-testid="finder-purchase-closed">
              <Alert tone="info" title="خرید اشتراک در حال حاضر بسته است">
                مدیریت هنوز فروش اشتراک جفت‌یابی را باز نکرده است.
              </Alert>
            </div>
          ) : sellable.length === 0 ? (
            <div className="mt-md">
              <EmptyState title="طرحی برای فروش منتشر نشده است" description="طرح‌ها و قیمت‌ها را مدیریت همزیست منتشر می‌کند." />
            </div>
          ) : (
            <ul className="mt-md grid gap-md sm:grid-cols-2 lg:grid-cols-4" data-testid="finder-plans">
              {sellable.map((slot) => {
                const planRow = slot.current!;
                const testId = slot.audience + '-' + slot.durationMonths;
                return (
                  <li key={planRow.id} className="hz-card hz-card--compact flex flex-col gap-xs" data-testid={'finder-plan-' + testId}>
                    <p className="text-caption text-text-secondary">
                      {'طرح ' + FINDER_AUDIENCE_FA[slot.audience] + ' — ' + FINDER_DURATION_FA[slot.durationMonths as FinderDuration]}
                    </p>
                    <p className="text-label-lg">{planRow.titleFa}</p>
                    <p className={planRow.priceToman === null ? 'hz-unset text-label-sm' : 'text-h4'} data-testid={'finder-plan-price-' + testId}>
                      {price(planRow.priceToman)}
                    </p>
                    <p className="mt-xs text-caption text-text-secondary">{'ظرفیت: ' + fa(planRow.activeAnimalCapacity) + ' حیوان فعال'}</p>
                    <p className="mt-2xs text-caption text-text-secondary">{SUSPENSION_POLICY_FA[planRow.suspensionPolicy]}</p>
                    {planRow.noteFa ? <p className="mt-xs text-caption text-text-secondary">{planRow.noteFa}</p> : null}
                    <BuyPlanForm
                      planVersionId={planRow.id}
                      label={standing.state === 'ACTIVE' ? 'تمدید با این طرح' : 'خرید این طرح'}
                      disabledReasonFa={slot.problemFa}
                      testId={testId}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {!audiences.includes('KENNEL') ? (
            <p className="mt-md text-caption text-text-secondary">طرح کنل برای حسابی است که کنل تأییدشده دارد.</p>
          ) : null}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <SectionHeader title="حیوانات شما برای جفت‌یابی" size="sm" />
            <Link href="/account/mating-finder/profiles" className="hz-link hz-link--standalone" data-testid="finder-profiles-link">
              مدیریت پروفایل‌ها
              <Icon name="arrowRight" size="xs" mirror />
            </Link>
          </div>
          <p className="mt-xs text-caption text-text-secondary">
            حیوانات ثبت‌شده شما از گونه‌ای که جفت‌یابی برایش باز است. میکروچیپ رسمی یکی از شرط‌های ورود است؛ احراز هویت،
            اظهار عقیم‌نبودن، وضعیت زنده‌بودن و تصاویر پایه هنگام فعال‌سازی پروفایل بررسی می‌شوند.
          </p>
          {animals.length === 0 ? (
            <div className="mt-md">
              <EmptyState title="حیوان ثبت‌شده‌ای ندارید" description="جفت‌یابی فقط برای حیوان ثبت‌شده در همزیست است." />
            </div>
          ) : (
            <ul className="hz-cardlist mt-md" data-testid="finder-animals">
              {animals.map((animal) => (
                <li
                  key={animal.id}
                  className="hz-cardlist__item flex-row flex-wrap items-center justify-between"
                  data-testid={'finder-animal-' + animal.id}
                >
                  <span className="hz-cardlist__title min-w-0">
                    {(animal.name ?? 'بدون نام') + ' · ' + (animal.breedNameFa ?? 'نژاد نامشخص') + ' · ' + (animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : 'جنس نامشخص')}
                  </span>
                  <StatusBadge tone={animal.hasOfficialChip ? 'success' : 'warning'}>
                    {animal.hasOfficialChip ? 'میکروچیپ رسمی ثبت‌شده' : 'بدون میکروچیپ رسمی'}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <SectionHeader title="تاریخچه اشتراک" size="sm" />
          {history.length === 0 ? (
            <p className="hz-body-sm text-text-secondary">هنوز خریدی ثبت نشده است.</p>
          ) : (
            <ul className="hz-cardlist" data-testid="finder-history">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="hz-cardlist__item flex-row flex-wrap items-center justify-between"
                  data-testid={'finder-history-' + row.id}
                >
                  <span className="hz-body-sm min-w-0">
                    {'طرح ' + FINDER_AUDIENCE_FA[row.audience] + ' ' + FINDER_DURATION_FA[row.durationMonths as FinderDuration] +
                      ' · نسخه ' + fa(row.planVersion) + ' · ' + price(row.priceToman) +
                      (row.startsAt && row.endsAt ? ' · از ' + formatInstantFa(row.startsAt) + ' تا ' + formatInstantFa(row.endsAt) : '')}
                  </span>
                  <StatusBadge status={row.status === 'ACTIVE' && row.endsAt && row.endsAt.getTime() <= now.getTime() ? 'EXPIRED' : row.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
