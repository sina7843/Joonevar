import { db } from '../src/db/client.ts';
import { healthReport } from '../src/health/service.ts';

export const dynamic = 'force-dynamic';

/**
 * Foundation entry point.
 *
 * This is deliberately a status page, not a product screen. Product routes are
 * built in their own prompts; showing an invented dashboard here would claim
 * behaviour that does not exist yet.
 */
export default async function Home() {
  const report = await healthReport(db());

  return (
    <main className="mx-auto max-w-3xl p-8 leading-8">
      <h1 className="text-2xl font-bold">همزیست — زیرساخت</h1>
      <p className="mt-2 text-sm">
        این صفحه وضعیت واقعی زیرساخت است. صفحات محصول در مراحل بعدی ساخته می‌شوند.
      </p>

      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <dt>وضعیت کلی</dt>
        <dd>{report.status === 'ok' ? 'آماده' : 'ناقص — داده یا اتصال واقعی کم است'}</dd>

        <dt>دیتابیس</dt>
        <dd>
          {report.database.reachable ? 'در دسترس' : 'در دسترس نیست'}
          {report.database.migrationsApplied !== null ? ' · ' + report.database.migrationsApplied + ' مهاجرت اعمال‌شده' : ''}
        </dd>

        <dt>تنظیمات محصول</dt>
        <dd>
          {report.settings.total} کلید · {report.settings.notConfigured.length} مورد «تعیین‌نشده»
        </dd>
      </dl>

      <h2 className="mt-8 text-lg font-bold">اتصال‌های بیرونی</h2>
      <ul className="mt-2 text-sm">
        {report.adapters.map((adapter) => (
          <li key={adapter.name} className="py-1">
            <span className="ltr-isolate font-mono">{adapter.name}</span> — {adapter.status}
          </li>
        ))}
      </ul>

      {report.settings.notConfigured.length > 0 ? (
        <>
          <h2 className="mt-8 text-lg font-bold">داده‌ای که هنوز وارد نشده است</h2>
          <p className="text-sm">
            این مقادیر «تعیین‌نشده» می‌مانند تا داده واقعی وارد شود؛ هیچ عدد پیش‌فرضی جای آن‌ها گذاشته نمی‌شود.
          </p>
          <ul className="mt-2 text-sm">
            {report.settings.notConfigured.map((key) => (
              <li key={key} className="ltr-isolate font-mono py-0.5">
                {key}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}
