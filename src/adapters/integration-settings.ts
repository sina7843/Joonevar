/**
 * Which provider each adapter uses — read from managed data, not from code.
 *
 * §21.4 asks for operational values to live in the database so that changing
 * one is an operator action rather than a deployment. The provider behind each
 * adapter is exactly such a value, so the superadmin sets it in
 * `/admin/settings` and this module is where the rest of the application asks
 * what the current answer is.
 *
 * The environment still has the last word on safety: a mock can never be the
 * effective choice in production, whatever the database says.
 */
import type { DbClient } from '../db/client.ts';
import type { Env } from '../config/env.ts';
import { env as loadEnv } from '../config/env.ts';
import { readSetting } from '../settings/service.ts';
import { adapterReports, type AdapterReport } from './registry.ts';

export type SmsMode = 'MOCK_AUTO' | 'PROVIDER';
export type PaymentMode = 'MOCK_AUTO' | 'DEV_GATEWAY' | 'PROVIDER';
export type DocumentEngine = 'CHROMIUM' | 'NONE';
export type ChipReaderMode = 'KEYBOARD_WEDGE' | 'INTEGRATED_READER';

export interface IntegrationSettings {
  readonly sms: { readonly mode: SmsMode; readonly provider: string | null; readonly apiKey: string | null };
  readonly payment: {
    readonly mode: PaymentMode;
    readonly provider: string | null;
    readonly apiKey: string | null;
  };
  readonly map: { readonly provider: string | null; readonly apiKey: string | null };
  readonly documentRender: { readonly engine: DocumentEngine };
  readonly chipReader: { readonly mode: ChipReaderMode };
}

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

async function read(database: DbClient, key: string): Promise<string | null> {
  try {
    return asString((await readSetting(database, key)).value);
  } catch {
    // A key that is not in the catalogue yet (an older database) behaves as
    // unset rather than breaking the page that asked.
    return null;
  }
}

/**
 * The effective configuration.
 *
 * A mock is only ever effective outside production. In production a mock in the
 * database is treated as "no provider at all", so the adapter fails loudly
 * instead of quietly pretending a payment or a message succeeded.
 */
export async function integrationSettings(
  database: DbClient,
  env: Env = loadEnv(),
): Promise<IntegrationSettings> {
  const [smsMode, smsProvider, smsKey, payMode, payProvider, payKey, mapProvider, mapKey, engine, chip] =
    await Promise.all([
      read(database, 'integration.sms.mode'),
      read(database, 'integration.sms.provider'),
      read(database, 'integration.sms.api_key'),
      read(database, 'integration.payment.mode'),
      read(database, 'integration.payment.provider'),
      read(database, 'integration.payment.api_key'),
      read(database, 'integration.map.provider'),
      read(database, 'integration.map.api_key'),
      read(database, 'integration.document_render.engine'),
      read(database, 'integration.chip_reader.mode'),
    ]);

  const production = env.APP_ENV === 'production';
  const smsResolved: SmsMode = smsMode === 'PROVIDER' || production ? 'PROVIDER' : 'MOCK_AUTO';
  const paymentResolved: PaymentMode =
    payMode === 'PROVIDER' || production ? 'PROVIDER' : payMode === 'DEV_GATEWAY' ? 'DEV_GATEWAY' : 'MOCK_AUTO';

  return {
    sms: { mode: smsResolved, provider: smsProvider ?? env.SMS_PROVIDER ?? null, apiKey: smsKey },
    payment: {
      mode: paymentResolved,
      provider: payProvider ?? env.PAYMENT_PROVIDER ?? null,
      apiKey: payKey,
    },
    map: { provider: mapProvider ?? env.MAP_PROVIDER ?? null, apiKey: mapKey },
    documentRender: { engine: engine === 'NONE' ? 'NONE' : 'CHROMIUM' },
    chipReader: { mode: chip === 'INTEGRATED_READER' ? 'INTEGRATED_READER' : 'KEYBOARD_WEDGE' },
  };
}

/** The map key a page may use; absent means the manual address form only. */
export async function mapApiKey(database: DbClient): Promise<{ provider: string | null; apiKey: string | null }> {
  const settings = await integrationSettings(database);
  return settings.map;
}

/**
 * The adapter report as the running system really stands — §26, §21.4.
 *
 * `adapterReports(env)` answers from environment variables alone. This one
 * overlays what the superadmin selected, so the panel and `/api/health` show
 * the provider that would actually answer the next call. A mock is reported as
 * a mock: it never counts as a verified integration.
 */
export async function adapterReportsWithSettings(
  database: DbClient,
  env: Env = loadEnv(),
): Promise<readonly AdapterReport[]> {
  const base = adapterReports(env);
  const settings = await integrationSettings(database, env);

  const overlay = (report: AdapterReport): AdapterReport => {
    switch (report.name) {
      case 'sms-otp':
        return settings.sms.mode === 'MOCK_AUTO'
          ? {
              ...report,
              status: 'LOCAL_TEST',
              provider: 'mock-auto',
              note: 'حالت شبیه‌سازی: ارسال همیشه موفق است، متن در صندوق توسعه ثبت می‌شود و به شماره واقعی چیزی نمی‌رود. کد همچنان واقعی، یک‌بارمصرف و دارای انقضاست.',
            }
          : { ...report, provider: settings.sms.provider, status: settings.sms.provider ? report.status : 'NOT_CONFIGURED' };
      case 'payment-gateway':
        if (settings.payment.mode === 'MOCK_AUTO') {
          return {
            ...report,
            status: 'LOCAL_TEST',
            provider: 'mock-auto',
            note: 'حالت شبیه‌سازی: بازگشت از درگاه بلافاصله و سمت سرور «پرداخت‌شده» تأیید می‌شود. مبلغ همان مبلغ منجمدشده Batch است و اثر پرداخت فقط یک بار اجرا می‌شود.',
          };
        }
        if (settings.payment.mode === 'DEV_GATEWAY') {
          return { ...report, status: 'LOCAL_TEST', provider: 'dev-local-gateway' };
        }
        return {
          ...report,
          provider: settings.payment.provider,
          status: settings.payment.provider ? report.status : 'NOT_CONFIGURED',
        };
      case 'map-provider':
        return {
          ...report,
          provider: settings.map.provider,
          status: settings.map.apiKey ? report.status : 'NOT_CONFIGURED',
          note:
            settings.map.apiKey === null
              ? 'سرویس ' + (settings.map.provider ?? 'نقشه') + ' انتخاب شده اما کلید آن وارد نشده است؛ تا آن زمان نقشه نمایش داده نمی‌شود و ثبت نشانی دستی کار می‌کند.'
              : 'سرویس ' + (settings.map.provider ?? 'نقشه') + ' با کلید واردشده فعال است.',
        };
      case 'document-render':
        return settings.documentRender.engine === 'CHROMIUM'
          ? {
              ...report,
              status: 'LOCAL_TEST',
              provider: 'chromium-pdf',
              note: 'تولید PDF با Chromium محلی؛ رایگان، بدون سرویس بیرونی و سازگار با فارسی و راست‌به‌چپ. قالب رسمی چاپی انجمن هنوز تحویل نشده و خروجی، چاپ داده‌های ثبت‌شده است.',
            }
          : { ...report, status: 'NOT_CONFIGURED', provider: null, note: 'خروجی PDF در تنظیمات خاموش است.' };
      case 'chip-reader':
        return {
          ...report,
          status: 'LOCAL_TEST',
          provider: settings.chipReader.mode === 'KEYBOARD_WEDGE' ? 'keyboard-wedge' : 'integrated-reader',
          note: 'ریدر بلوتوثی مثل صفحه‌کلید عمل می‌کند و شماره را در همان فیلد تایپ می‌کند؛ هیچ یکپارچه‌سازی سخت‌افزاری لازم نیست و ورود دستی همیشه در دسترس است.',
        };
      default:
        return report;
    }
  };

  return base.map(overlay);
}
