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

export const dynamic = 'force-dynamic';

const fa = (value: number): string => value.toLocaleString('fa-IR');
const price = (value: bigint | null): string => (value === null ? 'قیمت هنوز تعیین نشده' : formatTomanFa(configuredMoney(value.toString()))!);

const STATUS_FA: Record<string, string> = {
  PENDING_PAYMENT: 'در انتظار پرداخت',
  ACTIVE: 'پرداخت‌شده',
  SUPERSEDED: 'جایگزین‌شده با خرید تازه‌تر',
  CANCELLED: 'لغوشده',
};

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
    <PublicShell actor={actor} title="اشتراک جفت‌یابی" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">اشتراک جفت‌یابی</h1>
          <p className="mt-xs text-body-sm text-text-secondary">
            اشتراک فقط دسترسی می‌دهد: حیوانات فعال مالک مشترک برای همه دیده می‌شوند و مشترک، حیوانات آماده مالکان بدون
            اشتراک را هم می‌بیند. برای شکل‌گرفتن درخواست کافی است یکی از دو مالک اشتراک فعال داشته باشد. اشتراک رتبه حیوان
            را در نتایج بالا نمی‌برد.
          </p>
          <p className="mt-sm text-caption text-text-secondary">
            پرداخت توافق جفت‌گیری بیرون از همزیست انجام می‌شود؛ همزیست فقط هزینه اشتراک را دریافت می‌کند.
          </p>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-md">
            <h2 className="text-label-lg">وضعیت فعلی</h2>
            <span data-testid="finder-standing">
              <StatusBadge tone={standing.state === 'ACTIVE' ? 'success' : standing.state === 'EXPIRED' ? 'warning' : 'neutral'}>
                {standing.state === 'ACTIVE' ? 'اشتراک فعال' : standing.state === 'EXPIRED' ? 'اشتراک منقضی شده' : 'بدون اشتراک'}
              </StatusBadge>
            </span>
          </div>
          <dl className="mt-md grid gap-sm text-body-sm sm:grid-cols-2">
            {standing.current ? (
              <div>
                <dt className="text-caption text-text-secondary">پایان دوره فعلی</dt>
                <dd data-testid="finder-current-ends">{formatInstantFa(standing.current.endsAt)}</dd>
              </div>
            ) : null}
            {standing.chainEndsAt && standing.chainEndsAt.getTime() > now.getTime() && standing.chainEndsAt.getTime() !== standing.current?.endsAt.getTime() ? (
              <div>
                <dt className="text-caption text-text-secondary">پایان همه دوره‌های پرداخت‌شده</dt>
                <dd>{formatInstantFa(standing.chainEndsAt)}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-caption text-text-secondary">ظرفیت حیوان فعال</dt>
              <dd data-testid="finder-capacity">
                {capacity.limit === null
                  ? 'هنوز توسط مدیریت تعیین نشده'
                  : fa(capacity.limit) + (capacity.source === 'PLAN' ? ' (طرح ' + FINDER_AUDIENCE_FA[capacity.audience!] + ')' : ' (حساب بدون اشتراک)')}
              </dd>
            </div>
          </dl>
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
          <h2 className="text-label-lg">{standing.state === 'ACTIVE' ? 'تمدید' : 'خرید اشتراک'}</h2>
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
                  <li key={planRow.id} className="rounded-lg border border-border-subtle p-lg" data-testid={'finder-plan-' + testId}>
                    <p className="text-caption text-text-secondary">
                      {'طرح ' + FINDER_AUDIENCE_FA[slot.audience] + ' — ' + FINDER_DURATION_FA[slot.durationMonths as FinderDuration]}
                    </p>
                    <p className="mt-2xs text-label-lg">{planRow.titleFa}</p>
                    <p className="mt-xs text-label-md" data-testid={'finder-plan-price-' + testId}>
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
          <h2 className="text-label-lg">حیوانات شما برای جفت‌یابی</h2>
          <p className="mt-xs text-caption text-text-secondary">
            حیوانات ثبت‌شده شما از گونه‌ای که جفت‌یابی برایش باز است. میکروچیپ رسمی یکی از شرط‌های ورود است؛ احراز هویت،
            اظهار عقیم‌نبودن، وضعیت زنده‌بودن و تصاویر پایه هنگام فعال‌سازی پروفایل بررسی می‌شوند و فعال‌سازی پروفایل در گام
            بعدی جفت‌یابی باز می‌شود.
          </p>
          {animals.length === 0 ? (
            <div className="mt-md">
              <EmptyState title="حیوان ثبت‌شده‌ای ندارید" description="جفت‌یابی فقط برای حیوان ثبت‌شده در همزیست است." />
            </div>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="finder-animals">
              {animals.map((animal) => (
                <li
                  key={animal.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm"
                  data-testid={'finder-animal-' + animal.id}
                >
                  <span className="text-body-sm">
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
          <h2 className="text-label-lg">تاریخچه اشتراک</h2>
          {history.length === 0 ? (
            <p className="mt-md text-body-sm text-text-secondary">هنوز خریدی ثبت نشده است.</p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="finder-history">
              {history.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-sm rounded-md border border-border-subtle px-md py-sm"
                  data-testid={'finder-history-' + row.id}
                >
                  <span className="text-body-sm">
                    {'طرح ' + FINDER_AUDIENCE_FA[row.audience] + ' ' + FINDER_DURATION_FA[row.durationMonths as FinderDuration] +
                      ' · نسخه ' + fa(row.planVersion) + ' · ' + price(row.priceToman) +
                      (row.startsAt && row.endsAt ? ' · از ' + formatInstantFa(row.startsAt) + ' تا ' + formatInstantFa(row.endsAt) : '')}
                  </span>
                  <StatusBadge tone={row.status === 'ACTIVE' ? 'success' : row.status === 'PENDING_PAYMENT' ? 'info' : 'neutral'}>
                    {row.status === 'ACTIVE' && row.endsAt && row.endsAt.getTime() <= now.getTime() ? 'پایان‌یافته' : STATUS_FA[row.status]}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PublicShell>
  );
}
