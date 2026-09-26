import Link from 'next/link';
import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied } from '../../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { Card } from '../../../../src/ui/card.tsx';
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
    <PublicShell actor={guard.actor} title="علاقه‌مندی‌های جفت‌یابی" pathname="/account/mating-finder">
      <div className="space-y-lg">
        <Card>
          <h1 className="text-h4">علاقه‌مندی‌های جفت‌یابی</h1>
          <p className="mt-xs text-caption">
            <Link href="/mating-finder" className="text-text-brand underline underline-offset-4">
              جست‌وجوی جفت
            </Link>
          </p>
        </Card>
        {favorites.length === 0 ? (
          <EmptyState title="هنوز علاقه‌مندی ندارید" description="از صفحه جست‌وجو، پروفایل‌های مورد نظر را به علاقه‌مندی‌ها اضافه کنید." />
        ) : (
          <ul className="space-y-md" data-testid="finder-favorites">
            {favorites.map((fav) => (
              <li key={fav.profileId} data-testid={'finder-fav-' + fav.profileId}>
                {fav.card ? (
                  <MatingProfileCardView card={fav.card} />
                ) : (
                  <Card>
                    <p className="text-body-sm" data-testid={'finder-fav-gone-' + fav.profileId}>
                      این پروفایل دیگر برای شما در دسترس نیست.
                    </p>
                  </Card>
                )}
                <FavoriteForm profileId={fav.profileId} favorite />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PublicShell>
  );
}
