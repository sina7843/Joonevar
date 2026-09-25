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
    <PublicShell actor={guard.actor} title="فهرست من" pathname="/account/saved">
      <div className="space-y-lg p-lg">
        <Card>
          <h2 className="text-label-lg">نگه‌داشته‌ها</h2>
          {saved.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="saved-empty">
              هنوز چیزی نگه نداشته‌اید.
            </p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="saved-items">
              {saved.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-sm"
                  data-testid={'saved-' + (item.productId ?? item.listingId)}
                >
                  <div className="space-y-2xs">
                    <Link href={item.path} className="text-text-brand text-body-sm">
                      {item.labelFa}
                    </Link>
                    {item.savedPriceToman !== null && item.currentPriceToman !== null ? (
                      <p
                        className="text-caption text-text-secondary"
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

        <Card>
          <h2 className="text-label-lg">دنبال‌شده‌ها</h2>
          {following.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="following-empty">
              هنوز فروشگاه یا کنلی را دنبال نکرده‌اید.
            </p>
          ) : (
            <ul className="mt-md space-y-sm" data-testid="following">
              {following.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-sm text-body-sm"
                  data-testid={'following-' + (row.sellerId ?? row.kennelId)}
                >
                  <span>{row.sellerNameFa ?? 'کنل'}</span>
                  {row.sellerId ? (
                    <FollowForm action={toggleFollowAction} sellerId={row.sellerId} following />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">پیشنهادها</h2>
          <p className="mt-2xs text-caption text-text-secondary" data-testid="suggestions-note">
            هر پیشنهاد دلیل خودش را همراه دارد. هیچ پیشنهادی از روی حدس درباره شما ساخته نمی‌شود و جایگاه تبلیغی
            جداگانه و برچسب‌دار است.
          </p>
          {suggestions.length === 0 ? (
            <p className="mt-sm text-caption text-text-secondary" data-testid="suggestions-empty">
              فعلاً پیشنهادی نیست.
            </p>
          ) : (
            <ul className="mt-md space-y-2xs" data-testid="suggestions">
              {suggestions.map((suggestion) => (
                <li key={suggestion.productId} className="text-body-sm" data-testid={'suggestion-' + suggestion.productId}>
                  <Link href={'/shop/' + suggestion.slug} className="text-text-brand">
                    {suggestion.nameFa}
                  </Link>{' '}
                  — <span data-testid={'suggestion-reason-' + suggestion.productId}>{suggestion.reasonFa}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">بازدیدهای اخیر</h2>
          {viewed.length === 0 ? (
            <p className="mt-2xs text-caption text-text-secondary" data-testid="viewed-empty">
              تاریخچه بازدیدی نگه داشته نشده است.
            </p>
          ) : (
            <ul className="mt-md space-y-2xs text-body-sm" data-testid="viewed">
              {viewed.map((row) => (
                <li key={(row.productId ?? row.listingId)!} data-testid={'viewed-' + (row.productId ?? row.listingId)}>
                  {row.productNameFa ?? 'آگهی حیوان'} — {row.viewedAt.toLocaleDateString('fa-IR')}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-label-lg">تنظیمات حریم خصوصی</h2>
          <Alert tone="info" title="این سه کلید مال شماست">
            <span data-testid="privacy-note">
              خاموش‌کردن تاریخچه، آنچه تا امروز نگه داشته شده را هم پاک می‌کند؛ وگرنه کلید فقط درباره آینده وعده
              می‌داد.
            </span>
          </Alert>
          <div className="mt-lg">
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
