/**
 * Integration adapters and their honest status.
 *
 * ARCHITECTURE_BASELINE.md requires four distinguishable states and forbids a
 * fake provider from silently activating in production. Both rules are enforced
 * here: a local adapter refuses to construct when APP_ENV=production, and the
 * status is reported as-is by /api/health instead of being assumed READY.
 */
import type { Env } from '../config/env.ts';
import { env as loadEnv } from '../config/env.ts';
import { AppError } from '../domain/errors.ts';

export type AdapterStatus = 'NOT_CONFIGURED' | 'LOCAL_TEST' | 'SANDBOX_VERIFIED' | 'LIVE_VERIFIED';

export type AdapterName = 'sms-otp' | 'payment-gateway' | 'map-provider' | 'document-render' | 'private-storage';

export interface AdapterReport {
  readonly name: AdapterName;
  readonly status: AdapterStatus;
  readonly provider: string | null;
  readonly note: string;
}

/**
 * Status derived from configuration only. `SANDBOX_VERIFIED` and
 * `LIVE_VERIFIED` are never inferred from the presence of a provider name —
 * they require an actual verified call, which is recorded per prompt rather
 * than guessed here.
 */
function statusOf(provider: string | undefined, env: Env): AdapterStatus {
  if (!provider) return 'NOT_CONFIGURED';
  if (env.INTEGRATION_MODE === 'local') return 'LOCAL_TEST';
  if (env.INTEGRATION_MODE === 'sandbox') return 'SANDBOX_VERIFIED';
  return 'LIVE_VERIFIED';
}

export function adapterReports(env: Env = loadEnv()): readonly AdapterReport[] {
  return [
    {
      name: 'sms-otp',
      status: statusOf(env.SMS_PROVIDER, env),
      provider: env.SMS_PROVIDER ?? null,
      note: 'OTP، تغییر موبایل و دعوت پیامکی طرف مقابل به این آداپتور وابسته‌اند.',
    },
    {
      name: 'payment-gateway',
      status: statusOf(env.PAYMENT_PROVIDER, env),
      provider: env.PAYMENT_PROVIDER ?? null,
      note: 'تأیید پرداخت فقط سمت سرور انجام می‌شود؛ صفحه موفقیت سند پرداخت نیست.',
    },
    {
      name: 'map-provider',
      status: statusOf(env.MAP_PROVIDER, env),
      provider: env.MAP_PROVIDER ?? null,
      note: 'نبود نقشه، ثبت نشانی دستی و ادامه KYC و کنل را قفل نمی‌کند.',
    },
    {
      name: 'document-render',
      status: statusOf(env.DOCUMENT_RENDERER, env),
      provider: env.DOCUMENT_RENDERER ?? null,
      note: 'قالب رسمی سند هنوز تحویل نشده است.',
    },
    {
      name: 'private-storage',
      // Local filesystem storage is a real implementation, not a stub, but it
      // is only appropriate for a single-node deployment.
      status: 'LOCAL_TEST',
      provider: 'filesystem:' + env.PRIVATE_STORAGE_DIR,
      note: 'ذخیره محلی خصوصی؛ برای تولید به فضای ذخیره‌سازی خصوصی مدیریت‌شده نیاز است.',
    },
  ];
}

export function assertNotProduction(adapter: AdapterName, env: Env = loadEnv()): void {
  if (env.APP_ENV === 'production') {
    throw new AppError(
      'INTERNAL',
      'Local-test adapter "' + adapter + '" must never run in production',
    );
  }
}

/** OTP/SMS sender contract. The real provider is not selected yet. */
export interface SmsSender {
  send(input: { to: string; text: string }): Promise<void>;
}

/**
 * Development-only sender. It never reaches a real phone; it records the
 * message so a developer can complete a flow locally.
 */
export function localTestSmsSender(sink: Array<{ to: string; text: string }> = [], env?: Env): SmsSender {
  assertNotProduction('sms-otp', env ?? loadEnv());
  return {
    async send(input) {
      sink.push(input);
    },
  };
}

export interface PaymentIntent {
  readonly reference: string;
  readonly amountRial: bigint;
  readonly redirectUrl: string;
}

export interface PaymentVerification {
  readonly paid: boolean;
  readonly amountRial: bigint;
  readonly providerRef: string;
}

/**
 * Gateway contract. Verification is deliberately a separate server-side call:
 * a browser returning from the gateway proves nothing (§7, §22).
 */
export interface PaymentGateway {
  start(input: { reference: string; amountRial: bigint; callbackUrl: string }): Promise<PaymentIntent>;
  verify(input: { reference: string; providerRef: string }): Promise<PaymentVerification>;
}

/**
 * Local gateway for development. It only reports a payment as paid when the
 * test explicitly marks it, so no flow can accidentally believe money moved.
 */
export function localTestPaymentGateway(env?: Env): PaymentGateway & { markPaid(reference: string, amountRial: bigint): void } {
  assertNotProduction('payment-gateway', env ?? loadEnv());
  const paid = new Map<string, bigint>();
  return {
    markPaid(reference, amountRial) {
      paid.set(reference, amountRial);
    },
    async start(input) {
      return {
        reference: input.reference,
        amountRial: input.amountRial,
        redirectUrl: input.callbackUrl + '?reference=' + encodeURIComponent(input.reference),
      };
    },
    async verify(input) {
      const amount = paid.get(input.reference);
      return {
        paid: amount !== undefined,
        amountRial: amount ?? 0n,
        providerRef: input.providerRef,
      };
    },
  };
}
