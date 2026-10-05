import Link from 'next/link';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { PageHeader } from '../../src/ui/section-header.tsx';
import { Identifier, StatusBadge } from '../../src/ui/status.tsx';
import { db } from '../../src/db/client.ts';
import { listAnimals } from '../../src/animals/service.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import { generationLabel } from '../../src/domain/lineage.ts';

export const dynamic = 'force-dynamic';

const fa = (n: number) => n.toLocaleString('fa-IR');

/** The owner's animals (P05, tiles). Each tile links to its own independent file (§10). */
export default async function AnimalsPage() {
  const guard = await guardRoute('/animals');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const animals = await listAnimals(db(), guard.actor);
  const breeds = await db().select().from(referenceBreeds);
  const breedName = (id: string | null) => breeds.find((breed) => breed.id === id)?.nameFa ?? '—';
  const drafts = animals.filter((animal) => animal.status !== 'REGISTERED').length;

  return (
    <PublicShell
      actor={guard.actor}
      title="حیوان‌های من"
      pathname="/animals"
      primaryAction={{
        href: '/animals/new',
        label: 'ثبت حیوان هم‌زیست',
        icon: 'plus',
      }}
      header={
        <PageHeader
          title="حیوان‌های من"
          meta={
            animals.length > 0
              ? [fa(animals.length) + ' حیوان' + (drafts > 0 ? '، ' + fa(drafts) + ' پیش‌نویس' : '')]
              : undefined
          }
        />
      }
    >
      {animals.length === 0 ? (
        <EmptyState
          title="هنوز حیوانی ثبت نکرده‌اید"
          description="پس از ثبت، پرونده مستقل هر حیوان در همین فهرست دیده می‌شود."
          action={<ButtonLink href="/animals/new">ثبت حیوان هم‌زیست</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-lg md:grid-cols-2 lg:grid-cols-3" aria-label="حیوان‌های من">
          {animals.map((animal) => {
            const registered = animal.status === 'REGISTERED';
            const name = animal.name ?? 'بدون نام';
            return (
              <li key={animal.id} className="min-w-0">
                <Link
                  href={registered ? '/animals/' + animal.id : '/animals/' + animal.id + '/edit'}
                  className="hz-animal-tile hz-card--interactive h-full"
                >
                  <div className="hz-media hz-media--4x3">
                    {animal.photoFileId ? (
                      // Private photo: only through the authorised file route.
                      <img
                        src={'/api/files/' + animal.photoFileId}
                        alt={'تصویر ' + name}
                        loading="lazy"
                        width={800}
                        height={600}
                      />
                    ) : (
                      <div className="hz-media__empty">
                        <img src="/brand/logo/symbol.svg" alt="" />
                        <span className="hz-media__alt">تصویر ثبت نشده</span>
                      </div>
                    )}
                  </div>
                  <div className="hz-animal-tile__body">
                    <div className="flex flex-wrap items-center justify-between gap-sm">
                      <span className="hz-animal__name">{name}</span>
                      <StatusBadge tone={registered ? 'info' : 'neutral'} size="sm">
                        {registered ? 'پرونده اولیه' : 'پیش‌نویس'}
                      </StatusBadge>
                    </div>
                    <span className="hz-animal__meta">
                      {'سگ · ' + breedName(animal.breedId) + ' · ' + generationLabel(animal.generation)}
                    </span>
                    <span className="hz-animal__meta">
                      {animal.petId ? <Identifier label="شناسه:" value={animal.petId} /> : 'شناسه: —'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {animals.length > 0 ? (
        <div className="hz-hide-lg">
          <ButtonLink href="/animals/new" block iconStart="plus">
            ثبت حیوان هم‌زیست
          </ButtonLink>
        </div>
      ) : null}
    </PublicShell>
  );
}
