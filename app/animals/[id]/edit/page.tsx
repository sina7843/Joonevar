import { guardRoute } from '../../../../src/authz/guard.ts';
import { AccessDenied, RecordNotFound } from '../../../../src/ui/access-denied.tsx';
import { AppError } from '../../../../src/domain/errors.ts';
import { PublicShell } from '../../../../src/ui/shell.tsx';
import { db } from '../../../../src/db/client.ts';
import { breedOptions, draftOf, requireOwnedAnimal } from '../../../../src/animals/service.ts';
import { AnimalWizard } from './wizard.tsx';

export const dynamic = 'force-dynamic';

/**
 * The six-step registration form (§9.1, PET-004…PET-008).
 *
 * The draft is a real row, so leaving and returning — including a detour to
 * register a missing parent — restores every entered value.
 */
export default async function EditAnimalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ parentOf?: string }>;
}) {
  const { id } = await params;
  const guard = await guardRoute('/animals/' + id + '/edit');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  let animal;
  try {
    animal = await requireOwnedAnimal(db(), guard.actor, id);
  } catch (error) {
    // Ownership is a record-level rule, not a route rule, so it answers here.
    if (error instanceof AppError && error.code === 'NOT_FOUND') return <RecordNotFound error={error} />;
    throw error;
  }
  const breeds = await breedOptions(db());
  const draft = draftOf(animal);
  const { parentOf } = await searchParams;

  return (
    <PublicShell actor={guard.actor} title="ثبت حیوان هم‌زیست" pathname={'/animals/' + id + '/edit'}>
      <AnimalWizard
        parentOf={parentOf ?? null}
        breeds={breeds.map((breed) => ({ id: breed.id, nameFa: breed.nameFa, nameEn: breed.nameEn }))}
        animal={{
          id: animal.id,
          name: animal.name,
          breedId: animal.breedId,
          sex: animal.sex,
          birthDate: animal.birthDate,
          birthDateApproximate: animal.birthDateApproximate,
          color: animal.color,
          markings: animal.markings,
          hasPhoto: animal.photoFileId !== null,
          declaredMicrochipNumber: animal.declaredMicrochipNumber,
          origin: animal.origin,
          generation: animal.generation,
          draftStep: animal.draftStep,
          ownPedigreeCode: draft.ownPedigreeCode ?? null,
          sirePedigreeCode: draft.sirePedigreeCode ?? null,
          damPedigreeCode: draft.damPedigreeCode ?? null,
          lastLineageState: draft.lastLineageState ?? null,
        }}
      />
    </PublicShell>
  );
}
