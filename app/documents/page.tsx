import { inArray } from 'drizzle-orm';
import { guardRoute } from '../../src/authz/guard.ts';
import { AccessDenied } from '../../src/ui/access-denied.tsx';
import { PublicShell } from '../../src/ui/shell.tsx';
import { PageHeader } from '../../src/ui/section-header.tsx';
import { EmptyState } from '../../src/ui/states.tsx';
import { ButtonLink } from '../../src/ui/button.tsx';
import { DocumentCard } from '../../src/ui/document-card.tsx';
import { db } from '../../src/db/client.ts';
import { animals } from '../../src/db/schema/animals.ts';
import { sheetsOfOwner } from '../../src/documents/registration-sheet.ts';
import { pedigreesOfOwner } from '../../src/documents/pedigree.ts';

export const dynamic = 'force-dynamic';

const dateFa = (value: Date) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { dateStyle: 'medium', timeZone: 'Asia/Tehran' }).format(value);

/**
 * «اسناد من» — every issued document of this account, newest first (KUSR-046,
 * P05 list of DocumentCards). Only the owner's own sheets and pedigrees are
 * read; each card opens the document, its PDF and the public verification.
 */
export default async function DocumentsPage() {
  const guard = await guardRoute('/documents');
  if (!guard.ok) return <AccessDenied error={guard.denied} />;

  const [sheets, pedigrees] = await Promise.all([sheetsOfOwner(db(), guard.actor), pedigreesOfOwner(db(), guard.actor)]);
  const animalIds = [...new Set([...sheets.map((sheet) => sheet.animalId), ...pedigrees.map((pedigree) => pedigree.animalId)])];
  const names = new Map(
    animalIds.length === 0
      ? []
      : (await db().select({ id: animals.id, name: animals.name }).from(animals).where(inArray(animals.id, animalIds))).map((row) => [row.id, row.name] as const),
  );
  const nameOf = (id: string) => names.get(id) ?? 'بدون نام';
  const cards = [
    ...sheets.map((sheet) => ({ kind: 'REGISTRATION_SHEET' as const, id: sheet.id, number: sheet.sheetNo, animalId: sheet.animalId, issuedAt: sheet.issuedAt })),
    ...pedigrees.map((pedigree) => ({ kind: 'PEDIGREE' as const, id: pedigree.id, number: pedigree.pedigreeCode, animalId: pedigree.animalId, issuedAt: pedigree.issuedAt })),
  ].sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());

  return (
    <PublicShell
      actor={guard.actor}
      title="اسناد من"
      pathname="/documents"
      header={<PageHeader title="اسناد من" meta={cards.length > 0 ? [cards.length.toLocaleString('fa-IR') + ' سند صادرشده'] : undefined} />}
    >
      {cards.length === 0 ? (
        <EmptyState
          icon="fileText"
          title="هنوز سندی صادر نشده است"
          description="برگه ثبتی و شجره‌نامه پس از صدور برای هر حیوان اینجا می‌آیند."
          action={
            <ButtonLink tone="secondary" href="/animals">
              حیوان‌های من
            </ButtonLink>
          }
        />
      ) : (
        <ul className="grid list-none gap-lg p-0 md:grid-cols-2" data-testid="documents-list">
          {cards.map((card) => (
            <li key={card.kind + card.id}>
              <DocumentCard
                kind={card.kind}
                number={card.number}
                subject={nameOf(card.animalId)}
                issuedFa={dateFa(card.issuedAt)}
                pdfHref={(card.kind === 'PEDIGREE' ? '/api/documents/pedigree/' : '/api/documents/registration-sheet/') + card.id + '/pdf'}
                verifyHref={'/verify?code=' + encodeURIComponent(card.number)}
                viewHref={(card.kind === 'PEDIGREE' ? '/documents/pedigree/' : '/documents/') + card.id}
              />
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
