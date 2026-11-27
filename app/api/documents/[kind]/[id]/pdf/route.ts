import { NextResponse } from 'next/server';
import { db } from '../../../../../../src/db/client.ts';
import { currentActor } from '../../../../../../src/authz/request-actor.ts';
import { requireActor } from '../../../../../../src/authz/actor.ts';
import { toErrorBody, notFound } from '../../../../../../src/domain/errors.ts';
import { integrationSettings } from '../../../../../../src/adapters/integration-settings.ts';
import { renderDocumentPdf, type DocumentSpec } from '../../../../../../src/documents/render.ts';
import { sheetForOwner } from '../../../../../../src/documents/registration-sheet.ts';
import { pedigreeForOwner } from '../../../../../../src/documents/pedigree.ts';
import { cardForOwner } from '../../../../../../src/mating/allocation.ts';
import { formatCivilDateFa } from '../../../../../../src/domain/calendar.ts';
import { eq } from 'drizzle-orm';
import { animals } from '../../../../../../src/db/schema/animals.ts';
import { referenceBreeds } from '../../../../../../src/db/schema/core.ts';
import { pedigreeSheetOf } from '../../../../../../src/documents/pedigree-tree.ts';
import { generationLabel } from '../../../../../../src/domain/lineage.ts';
import { site } from '../../../../../../src/public/request.ts';

export const dynamic = 'force-dynamic';

const FOOTER =
  'این خروجی، چاپ داده‌های ثبت‌شده در هم‌زیست است و قالب رسمی چاپی انجمن نیست. اعتبار سند از پرونده همان حیوان در سامانه بررسی می‌شود.';

const day = (value: Date) => formatCivilDateFa(value.toISOString().slice(0, 10));

const SEX_FA: Record<string, string> = { MALE: 'نر', FEMALE: 'ماده' };

/** The animal block every animal document opens with; a missing value is «—», never blank. */
async function animalFields(animalId: string) {
  const [animal] = await db().select().from(animals).where(eq(animals.id, animalId));
  const [breed] = animal?.breedId ? await db().select().from(referenceBreeds).where(eq(referenceBreeds.id, animal.breedId)) : [];
  return [
    { labelFa: 'نام حیوان', value: animal?.name ?? '—' },
    { labelFa: 'نژاد', value: breed?.nameFa ?? '—' },
    { labelFa: 'جنس', value: (animal?.sex && SEX_FA[animal.sex]) || '—' },
    { labelFa: 'تاریخ تولد', value: animal?.birthDate ? (animal.birthDateApproximate ? 'حدود ' : '') + formatCivilDateFa(animal.birthDate) : '—' },
    { labelFa: 'نسل', value: animal ? generationLabel(animal.generation) : '—' },
  ];
}

/** Signature slots on every animal document; names come from the issuance record when it keeps them. */
const SIGNERS = [
  { roleFa: 'کارشناس صادرکننده', nameFa: null },
  { roleFa: 'دامپزشک تأییدکننده', nameFa: null },
];

const verifyUrl = (code: string) => site().origin + '/verify?code=' + encodeURIComponent(code);

/**
 * A printable PDF of one issued document — §13، §14، §19.4.
 *
 * Authorisation happens before anything is rendered: each lookup is the same
 * owner-scoped one the screen uses, so a document that is not yours answers
 * "not found" rather than producing a file.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  try {
    // Not `guardRoute`: that one sends a browser to the sign-in page, which is
    // the right answer for a page and the wrong answer for a file download. Here
    // an unauthenticated caller gets a status code, not a redirect.
    const actor = requireActor(await currentActor(db()));

    const settings = await integrationSettings(db());
    if (settings.documentRender.engine === 'NONE') {
      throw notFound('خروجی PDF در تنظیمات فعال نیست.');
    }

    let spec: DocumentSpec;
    if (kind === 'registration-sheet') {
      const sheet = await sheetForOwner(db(), actor, id);
      spec = {
        titleFa: 'برگه ثبتی حیوان',
        docTypeFa: 'برگه ثبتی',
        subtitleFa: 'سند ثبت اولیه حیوان',
        identifierLabelFa: 'شماره برگه',
        identifier: sheet.sheetNo ?? '—',
        issuedFa: sheet.issuedAt ? 'صادرشده در ' + day(sheet.issuedAt) : null,
        fields: await animalFields(sheet.animalId),
        sections: [
          {
            titleFa: 'شناسه‌ها',
            twoColumns: true,
            fields: [
              { labelFa: 'شناسه حیوان (Pet ID)', value: sheet.petId ?? '—' },
              { labelFa: 'شماره میکروچیپ', value: sheet.microchipNumber },
              { labelFa: 'کد رهگیری نمونه', value: sheet.sampleTrackingCode },
            ],
          },
        ],
        signers: SIGNERS,
        verifyUrl: sheet.sheetNo ? verifyUrl(sheet.sheetNo) : null,
        footerFa: FOOTER,
      };
    } else if (kind === 'pedigree') {
      const pedigree = await pedigreeForOwner(db(), actor, id);
      spec = {
        titleFa: 'شجره‌نامه',
        docTypeFa: 'شجره‌نامه',
        subtitleFa: 'صادرشده پس از نتیجه نهایی Parentage و پرداخت صدور',
        identifierLabelFa: 'کد شجره‌نامه',
        identifier: pedigree.pedigreeCode,
        issuedFa: pedigree.issuedAt ? 'صادرشده در ' + day(pedigree.issuedAt) : null,
        fields: await animalFields(pedigree.animalId),
        pedigree: await pedigreeSheetOf(db(), { animalId: pedigree.animalId, sireAnimalId: pedigree.sireAnimalId, damAnimalId: pedigree.damAnimalId }),
        signers: SIGNERS,
        verifyUrl: verifyUrl(pedigree.pedigreeCode),
        footerFa: FOOTER,
      };
    } else if (kind === 'puppy-card') {
      const view = await cardForOwner(db(), actor, id);
      spec = {
        titleFa: 'کارت توله',
        docTypeFa: 'کارت توله',
        subtitleFa: 'این کارت با برگه ثبتی، شجره‌نامه یا نتیجه ژنتیک یکی نیست.',
        identifierLabelFa: 'شماره کارت',
        identifier: view.card.cardNo,
        issuedFa: 'صادرشده در ' + day(view.card.issuedAt),
        fields: [
          { labelFa: 'کد موقت توله', value: view.puppy.tempCode },
          { labelFa: 'نام', value: view.puppy.nameFa ?? 'بدون نام' },
          { labelFa: 'نسخه تخصیص', value: String(view.card.allocationVersion) },
        ],
        signers: SIGNERS,
        verifyUrl: verifyUrl(view.card.cardNo),
        footerFa: FOOTER,
      };
    } else {
      throw notFound('نوع سند شناخته نشد.');
    }

    const pdf = await renderDocumentPdf(spec);
    return new NextResponse(Buffer.from(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'inline; filename="' + kind + '-' + id + '.pdf"',
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    const { status, body } = toErrorBody(error);
    return NextResponse.json(body, { status });
  }
}
