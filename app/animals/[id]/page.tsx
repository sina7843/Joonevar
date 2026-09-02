import { guardRoute } from '../../../src/authz/guard.ts';
import { AccessDenied } from '../../../src/ui/access-denied.tsx';
import { PublicShell } from '../../../src/ui/shell.tsx';
import { Card } from '../../../src/ui/card.tsx';
import { Identifier } from '../../../src/ui/status.tsx';
import { Alert } from '../../../src/ui/alert.tsx';

export const dynamic = 'force-dynamic';

/**
 * Animal profile composition points — §10.
 *
 * The sections and their order are the ones the product requires. They are
 * rendered as empty composition points rather than filled with a sample animal,
 * because animal records do not exist yet (PROMPT-006) and a plausible-looking
 * profile would be indistinguishable from a real one.
 *
 * Identifiers keep their own namespaces (§23.2): Animal ID is internal, Pet ID
 * exists only once a registration sheet is issued.
 */
const SECTIONS: ReadonlyArray<{ id: string; title: string; note: string }> = [
  { id: 'identity', title: 'هویت', note: 'اطلاعات پایه، جنسیت، نژاد و نسل محاسبه‌شده' },
  { id: 'ownership', title: 'مالکیت', note: 'مالک فعلی و سابقه تخصیص' },
  { id: 'microchip', title: 'میکروچیپ', note: 'شماره میکروچیپ و اتصال دائمی آن به همین حیوان' },
  { id: 'sample', title: 'نمونه و Custody', note: 'کد رهگیری نمونه، دامپزشک نگهدارنده و زنجیره رویدادها' },
  { id: 'registration', title: 'برگه ثبتی', note: 'وضعیت صدور و پرداخت مربوط' },
  { id: 'parentage', title: 'Parentage Result', note: 'نتیجه مرکز ژنتیک و نسخه‌های آن' },
  { id: 'pedigree', title: 'شجره‌نامه', note: 'کد شجره‌نامه و وضعیت صدور' },
  { id: 'family', title: 'خانواده و نسب', note: 'والدین قابل Resolve و ancestry' },
  { id: 'permits', title: 'مجوزها', note: 'مجوز جفت‌گیری و پرونده‌های مرتبط' },
  { id: 'mating-dates', title: 'تاریخ‌های جفت‌گیری', note: 'اعلام‌ها، تأییدها و نسخه‌ها' },
  { id: 'litter', title: 'بارداری، زایمان و Litter', note: 'اعلام کاربر و نتیجه مستقل دامپزشک' },
  { id: 'documents', title: 'مدارک', note: 'فایل‌های خصوصی با دسترسی کنترل‌شده' },
  { id: 'timeline', title: 'تاریخچه', note: 'رویدادها با زمان، وضعیت، مسئول اقدام و CTA ادامه' },
];

export default async function AnimalProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardRoute('/animals/' + id);
  if (!guard.ok) return <AccessDenied error={guard.denied} />;
  const { actor } = guard;

  return (
    <PublicShell actor={actor} title="پرونده حیوان" pathname={'/animals/' + id}>
      <div className="space-y-lg">
        <Card>
          <div className="flex items-start justify-between gap-md">
            <div className="min-w-0">
              <h2 className="text-h4">پرونده حیوان</h2>
              <p className="mt-2xs text-caption text-text-secondary">
                <Identifier label="شناسه پرونده:" value={id} />
              </p>
              <p className="mt-2xs text-caption text-text-secondary">شناسه رسمی (Pet ID): — تا صدور برگه ثبتی</p>
            </div>
          </div>
        </Card>

        <Alert tone="info" title="این پرونده هنوز داده‌ای ندارد">
          ساختار بخش‌های پرونده طبق سند آماده شده است. رکورد حیوان، میکروچیپ، نمونه و اسناد در مراحل بعدی
          پیاده‌سازی ثبت می‌شوند و همین بخش‌ها با داده واقعی پر می‌شوند.
        </Alert>

        <div className="space-y-md">
          {SECTIONS.map((section) => (
            <section key={section.id} aria-labelledby={'sec-' + section.id}>
              <Card>
                <h3 id={'sec-' + section.id} className="text-label-lg">
                  {section.title}
                </h3>
                <p className="mt-2xs text-caption text-text-secondary">{section.note}</p>
                <p className="mt-md text-body-sm text-text-disabled">اطلاعاتی برای نمایش وجود ندارد.</p>
              </Card>
            </section>
          ))}
        </div>
      </div>
    </PublicShell>
  );
}
