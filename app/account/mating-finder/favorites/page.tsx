import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { PageHeader } from '../../../../src/ui/section-header.tsx';
import { ButtonLink } from '../../../../src/ui/button.tsx';
import { EmptyState } from '../../../../src/ui/states.tsx';
import { db } from '../../../../src/db/client.ts';
import { myFavorites } from '../../../../src/finder/discovery.ts';
import { MatingProfileCardView } from '../../../../src/finder/profile-card.tsx';
import { FavoriteForm } from '../../../../src/finder/discovery-forms.tsx';

export const dynamic = 'force-dynamic';

/**
 * Favourites — PHASE-4 PROMPT-004. Each is checked against visibility again:
 * a profile no longer shown to this viewer is listed without any of its details.
 */
export default async function FinderFavoritesPage() {
  const guard = await guardRoute('/account/mating-finder/favorites');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const favorites = await myFavorites(db(), guard.actor);
  return (
    <PublicShell
      actor={guard.actor}
      title="علاقه‌مندی‌های جفت‌یابی"
      pathname="/account/mating-finder"
      header={
        <PageHeader
          title="علاقه‌مندی‌های جفت‌یابی"
          back={{ href: '/account/mating-finder' }}
          meta={favorites.length > 0 ? [favorites.length.toLocaleString('fa-IR') + ' پروفایل'] : []}
          actions={
            <ButtonLink tone="secondary" href="/mating-finder" iconStart="magnifyingGlass">
              جست‌وجوی جفت
            </ButtonLink>
          }
        />
      }
    >
      <div className="space-y-lg">
        {favorites.length === 0 ? (
          <EmptyState
            icon="heart"
            title="هنوز علاقه‌مندی ندارید"
            description="از صفحه جست‌وجو، پروفایل‌های مورد نظر را به علاقه‌مندی‌ها اضافه کنید."
            action={
              <ButtonLink tone="secondary" href="/mating-finder">
                جست‌وجوی جفت
              </ButtonLink>
            }
          />
        ) : (
          <ul className="grid gap-s20 md:grid-cols-2 xl:grid-cols-3" data-testid="finder-favorites">
            {favorites.map((fav) => (
              <li key={fav.profileId} className="min-w-0" data-testid={'finder-fav-' + fav.profileId}>
                {fav.card ? (
                  <MatingProfileCardView card={fav.card} href={'/mating-finder/' + fav.profileId}>
                    <div className="hz-card__footer">
                      <FavoriteForm profileId={fav.profileId} favorite />
                      <Link href={'/mating-finder/' + fav.profileId} className="hz-link hz-link--standalone">
                        مشاهده پروفایل
                      </Link>
                    </div>
                  </MatingProfileCardView>
                ) : (
                  <Card className="space-y-sm">
                    <p className="hz-body-sm" data-testid={'finder-fav-gone-' + fav.profileId}>
                      این پروفایل دیگر برای شما در دسترس نیست.
                    </p>
                    <FavoriteForm profileId={fav.profileId} favorite />
                  </Card>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
