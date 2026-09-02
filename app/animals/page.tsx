import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { AnimalCard } from '../../src/ui/card.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { db } from '../../src/db/client.ts';
import { listAnimals } from '../../src/animals/service.ts';
import { referenceBreeds } from '../../src/db/schema/core.ts';
import { generationLabel } from '../../src/domain/lineage.ts';

export const dynamic = 'force-dynamic';

/** The owner's animals. Each row links to its own independent file (§10). */
export default async function AnimalsPage() {
  const guard = await guardRoute('/animals');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const animals = await listAnimals(db(), guard.actor);
  const breeds = await db().select().from(referenceBreeds);
  const breedName = (id: string | null) => breeds.find((breed) => breed.id === id)?.nameFa ?? '—';

  return (
    <PublicShell actor={guard.actor} title="حیوان‌های من" pathname="/animals">
      <div className="space-y-lg">
        <ButtonLink href="/animals/new" block>
          ثبت حیوان هم‌زیست
        </ButtonLink>

        {animals.length === 0 ? (
          <EmptyState
            title="هنوز حیوانی ثبت نکرده‌اید"
            description="پس از ثبت، پرونده مستقل هر حیوان در همین فهرست دیده می‌شود."
          />
        ) : (
          animals.map((animal) => (
            <AnimalCard
              key={animal.id}
              name={animal.name ?? 'بدون نام'}
              speciesBreed={'سگ · ' + breedName(animal.breedId) + ' · ' + generationLabel(animal.generation)}
              petId={animal.petId}
              status={
                animal.status === 'REGISTERED'
                  ? { tone: 'info', label: 'پرونده اولیه' }
                  : { tone: 'neutral', label: 'پیش‌نویس' }
              }
              href={animal.status === 'REGISTERED' ? '/animals/' + animal.id : '/animals/' + animal.id + '/edit'}
            />
          ))
        )}
      </div>
    </PublicShell>
  );
}
