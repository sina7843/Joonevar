/**
 * The adapters the running application should use right now.
 *
 * One place asks the managed settings which provider is selected and hands back
 * the matching adapter, so a screen never decides that for itself and an
 * operator's change in `/admin/settings` takes effect everywhere at once.
 */
import { db } from '../db/client.ts';
import { env as loadEnv } from '../config/env.ts';
import { integrationSettings } from './integration-settings.ts';
import {
  paymentGatewayForMode,
  providerNameForMode,
  smsSenderForMode,
  type PaymentGateway,
  type SmsSender,
} from './registry.ts';

export async function currentSmsSender(): Promise<SmsSender> {
  const env = loadEnv();
  const settings = await integrationSettings(db(), env);
  return smsSenderForMode(db(), settings.sms.mode, settings.sms.provider, env);
}

export async function currentPaymentGateway(): Promise<PaymentGateway> {
  const env = loadEnv();
  const settings = await integrationSettings(db(), env);
  return paymentGatewayForMode(db(), settings.payment.mode, settings.payment.provider, env);
}

/** The provider name stored on the attempt, so a record says who answered. */
export async function currentPaymentProvider(): Promise<string> {
  const settings = await integrationSettings(db(), loadEnv());
  return providerNameForMode(settings.payment.mode, settings.payment.provider);
}
