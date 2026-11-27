import Link from 'next/link';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { db } from '../../../src/db/client.ts';
import { guardRoute } from '../../../src/authz/guard.ts';
import { Card } from '../../../src/ui/card.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import {
  followingFor,
  preferencesOf,
  recentlyViewed,
  savedFor,
} from '../../../src/commerce/saved.ts';
import { suggestionsFor } from '../../../src/commerce/suggestions.ts';
import { PreferencesForm, SaveForm, FollowForm } from '../../../src/commerce/trust-forms.tsx';
import { setPreferencesAction, toggleFollowAction, toggleSavedAction } from '../orders/trust-actions.ts';
import { PageHeader, SectionHeader } from '../../../src/ui/section-header.tsx';
import { Icon } from '../../../src/ui/icon.tsx';

export const dynamic = 'force-dynamic';

const fa = (value: number | bigint): string => value.toLocaleString('fa-IR');

/**
 * What this person kept, follows and lately looked at — PROMPT-012.
 *
 * The switches are on the same page as the things they govern, because a
 * setting buried somewhere else is one nobody finds. Turning the history off
 * also clears what was kept, so the switch is about the past as well as the
 * future.
 */
export default async function SavedPage() {
  const guard = await guardRoute('/account/saved');
  if (!guard.ok) throw guard.denied;

  const [saved, following, preferences, viewed, suggestions] = await Promise.all([
    savedFor(db(), guard.actor),
    followingFor(db(), guard.actor),
    preferencesOf(db(), guard.actor.accountId!),
    recentlyViewed(db(), guard.actor),
    suggestionsFor(db(), guard.actor),
  ]);

  return (
    <PublicShell
      actor={guard.actor}
      title="فهرست من"
      pathname="/account/saved"
      header={
        <PageHeader
          title="فهرست من"
          back={{ href: '/dashboard' }}
          meta={[...(saved.length > 0 ? [fa(saved.length) + ' نگه‌داشته'] : []), ...(following.length > 0 ? [fa(following.length) + ' دنبال‌شده'] : [])]}
        />
      }
    >
      <div className="space-y-xl">
        <Card className="space-y-md">
          <SectionHeader title="نگه‌داشته‌ها" size="sm" />
          {saved.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="saved-empty">
              هنوز چیزی نگه نداشته‌اید.
            </p>
          ) : (
            <ul className="hz-cardlist" data-testid="saved-items">
              {saved.map((item) => (
                <li
                  key={item.id}
                  className="hz-cardlist__item flex-row flex-wrap items-center justify-between"
                  data-testid={'saved-' + (item.productId ?? item.listingId)}
                >
                  <div className="min-w-0 space-y-2xs">
                    <Link href={item.path} className="hz-cardlist__title block text-text-primary">
                      {item.labelFa}
                    </Link>
                    {item.savedPriceToman !== null && item.currentPriceToman !== null ? (
                      <p
                        className="hz-cardlist__meta"
                        data-testid={'saved-price-' + (item.productId ?? item.listingId)}
                      >
                        {item.currentPriceToman < item.savedPriceToman
                          ? 'از ' + fa(item.savedPriceToman) + ' به ' + fa(item.currentPriceToman) + ' تومان رسید'
                          : fa(item.currentPriceToman) + ' تومان'}
                      </p>
                    ) : null}
                  </div>
                  <SaveForm
                    action={toggleSavedAction}
                    productId={item.productId ?? undefined}
                    listingId={item.listingId ?? undefined}
                    saved
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-md">
          <SectionHeader title="دنبال‌شده‌ها" size="sm" />
          {following.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="following-empty">
              هنوز فروشگاه یا کنلی را دنبال نکرده‌اید.
            </p>
          ) : (
            <ul className="hz-cardlist" data-testid="following">
              {following.map((row) => (
                <li
                  key={row.id}
                  className="hz-cardlist__item flex-row flex-wrap items-center justify-between"
                  data-testid={'following-' + (row.sellerId ?? row.kennelId)}
                >
                  <span className="hz-cardlist__title inline-flex items-center gap-xs">
                    <Icon name="storefront" size="sm" className="text-text-secondary" />
                    {row.sellerNameFa ?? 'کنل'}
                  </span>
                  {row.sellerId ? (
                    <FollowForm action={toggleFollowAction} sellerId={row.sellerId} following />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-md">
          <SectionHeader title="پیشنهادها" size="sm" />
          <p className="hz-caption" data-testid="suggestions-note">
            هر پیشنهاد دلیل خودش را همراه دارد. هیچ پیشنهادی از روی حدس درباره شما ساخته نمی‌شود و جایگاه تبلیغی
            جداگانه و برچسب‌دار است.
          </p>
          {suggestions.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="suggestions-empty">
              فعلاً پیشنهادی نیست.
            </p>
          ) : (
            <ul className="hz-cardlist md:grid md:grid-cols-2" data-testid="suggestions">
              {suggestions.map((suggestion) => (
                <li key={suggestion.productId} className="hz-cardlist__item" data-testid={'suggestion-' + suggestion.productId}>
                  <Link href={'/shop/' + suggestion.slug} className="hz-cardlist__title text-text-primary">
                    {suggestion.nameFa}
                  </Link>
                  <span className="hz-cardlist__meta inline-flex items-start gap-xs">
                    <Icon name="info" size="xs" />
                    <span data-testid={'suggestion-reason-' + suggestion.productId}>{suggestion.reasonFa}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-md">
          <SectionHeader title="بازدیدهای اخیر" size="sm" />
          {viewed.length === 0 ? (
            <p className="hz-body-sm text-text-secondary" data-testid="viewed-empty">
              تاریخچه بازدیدی نگه داشته نشده است.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle" data-testid="viewed">
              {viewed.map((row) => (
                <li
                  key={(row.productId ?? row.listingId)!}
                  className="flex flex-wrap items-baseline justify-between gap-sm py-sm"
                  data-testid={'viewed-' + (row.productId ?? row.listingId)}
                >
                  <span className="text-label-sm">{row.productNameFa ?? 'آگهی حیوان'}</span>
                  <span className="hz-caption">{row.viewedAt.toLocaleDateString('fa-IR')}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-md">
          <SectionHeader title="تنظیمات حریم خصوصی" size="sm" />
          <Alert tone="info" title="این سه کلید مال شماست">
            <span data-testid="privacy-note">
              خاموش‌کردن تاریخچه، آنچه تا امروز نگه داشته شده را هم پاک می‌کند؛ وگرنه کلید فقط درباره آینده وعده
              می‌داد.
            </span>
          </Alert>
          <div>
            <PreferencesForm
              action={setPreferencesAction}
              recommendationsOff={preferences.recommendationsOff}
              historyOff={preferences.historyOff}
              priceAlertsOff={preferences.priceAlertsOff}
            />
          </div>
        </Card>
      </div>
    </PublicShell>
  );
}
