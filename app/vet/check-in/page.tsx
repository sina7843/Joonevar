import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Alert } from '../../../src/ui/alert.tsx';
import { EmptyState } from '../../../src/ui/states.tsx';
import { db } from '../../../src/db/client.ts';
import { myLocations } from '../../../src/vets/visits.ts';
import { CheckInForm } from './check-in-form.tsx';

export const dynamic = 'force-dynamic';

/**
 * The check-in desk — §11.3.
 *
 * One field takes the code, whether a scanner typed it or a person did: QR and
 * manual entry are two renderings of the same value, so there is one input and
 * one server path behind it.
 */
export default async function CheckInPage() {
  const guard = await guardRoute('/vet/check-in');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const locations = await myLocations(db(), guard.actor);

  return (
    <PublicShell actor={guard.actor} title="پذیرش مراجعه" pathname="/vet/check-in">
      <div className="space-y-lg">
        <Alert tone="info" title="کد باید به همین مرکز تعلق داشته باشد">
          کد مراجعه برای همان حیوان، همان دامپزشک و همان مرکز صادر شده است و فقط یک بار پذیرفته می‌شود.
        </Alert>

        {locations.length === 0 ? (
          <EmptyState
            title="مرکزی برای شما ثبت نشده است"
            description="تا ثبت مرکز و پروانه معتبر آن توسط سوپرادمین، پذیرش مراجعه ممکن نیست."
          />
        ) : (
          <CheckInForm
            locations={locations.map((l) => ({ id: l.id, nameFa: l.nameFa }))}
          />
        )}
      </div>
    </PublicShell>
  );
}
