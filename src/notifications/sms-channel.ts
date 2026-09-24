/**
 * The SMS channel of the outbox — Phase 2.5 §10 (PROMPT-015).
 *
 * The outbox knows about attempts, backoff and evidence; the provider knows
 * about sending. This is the thin piece between them, and it is deliberately
 * dull: it hands the provider the sentence the versioned catalogue rendered and
 * the recipient's own number, and lets the error through so the outbox can
 * decide whether to try again.
 *
 * Nothing here chooses a provider. That is `currentSmsSender()`, which in every
 * non-production environment is a sender that writes to a table instead of
 * reaching a phone — which is also why a test can never send a real message.
 */
import type { SmsSender } from '../adapters/registry.ts';
import type { OutboundMessage, OutboundSender } from './outbox.ts';

export function smsOutboundSender(sender: SmsSender): OutboundSender {
  return {
    channel: 'SMS',
    async send(message: OutboundMessage, recipientMobile: string) {
      // The provider is given two things: a number and a sentence written in
      // advance. No record value, no reason text, no amount.
      await sender.send({ to: recipientMobile, text: message.text });
    },
  };
}

/**
 * A sender that always fails, for proving that a provider outage delays a
 * message instead of undoing the decision behind it. Kept beside the real
 * channel so the failure path is exercised the same way the success path is.
 */
export function failingSmsSender(reasonFa = 'ارائه‌دهنده پیامک در دسترس نیست.'): SmsSender {
  return {
    async send() {
      throw new Error(reasonFa);
    },
  };
}
