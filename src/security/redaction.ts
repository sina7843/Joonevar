/**
 * What must never be written down twice — PROMPT-013.
 *
 * Audit rows, error reports and anything else that leaves a record pass
 * through here first. The rule is not "be careful what you log": careful is a
 * property of a person on a good day, and this has to hold on every other one.
 *
 * In a record, both secrets and identifying numbers are replaced entirely. A
 * national id in an audit row is not evidence of anything — the row already
 * names the record it is about — so keeping even part of it buys nothing and
 * costs the obvious. `maskTail` exists beside this for the screens where an
 * operator genuinely has to recognise an account, and those pass it a value
 * they are already entitled to see.
 *
 * This replaces the narrower list the audit service carried: matching is by
 * suffix rather than exact spelling, so `settlementIban` and `buyerNationalId`
 * are caught as well as `iban` and `national_id`, and free text is scanned for
 * numbers somebody typed into it.
 */

/**
 * Keys whose value never survives, matched by suffix.
 *
 * Only terms that cannot mean anything else are here. `code` is not among
 * them: a province code and a species code are ordinary reference data, and
 * a rule that ate them would make the records useless while protecting
 * nothing.
 */
const SECRET_SUFFIXES = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'privatekey',
  'private_key',
];

/** Keys that are secrets only when spelled exactly this way. */
const SECRET_EXACT = [
  'otp',
  'code',
  'otpcode',
  'otp_code',
  'verificationcode',
  'verification_code',
  'session',
  'sessiontoken',
];

/**
 * Keys whose value is an identifier a record does not need: replaced.
 *
 * A national id in an audit row is not evidence of anything — the row already
 * names the record it is about — so keeping even part of it buys nothing.
 */
const IDENTIFIER_KEYS = [
  'nationalid',
  'national_id',
  'nationalidentifier',
  'national_identifier',
  'mobile',
  'phone',
  'recipientphone',
  'recipient_phone',
  'iban',
  'settlementiban',
  'settlement_iban',
  'card',
  'postalcode',
  'postal_code',
  'chip',
  'chipnumber',
  'chip_number',
  'bankreference',
  'bank_reference',
  'cardnumber',
  'card_number',
  'accountnumber',
  'account_number',
  'receipt',
  'filebytes',
];

/**
 * The marker, in ASCII and unchanged from the audit service this replaced:
 * rows written before today read the same as rows written after it.
 */
const REDACTED = '[redacted]';

const normalise = (key: string): string => key.toLowerCase().replace(/[^a-z_]/g, '');

const isSecret = (key: string): boolean => {
  const name = normalise(key);
  return SECRET_EXACT.includes(name) || SECRET_SUFFIXES.some((secret) => name.endsWith(secret));
};

/**
 * A value the caller already masked, such as `0912***80`.
 *
 * Masking is a decision somebody made on purpose — it is how an operator
 * recognises the account a row is about — and replacing it would take that
 * away while protecting nothing the mask does not already protect.
 */
const alreadyMasked = (value: unknown): boolean => typeof value === 'string' && value.includes('*');

const isIdentifier = (key: string): boolean => {
  const name = normalise(key);
  return IDENTIFIER_KEYS.some((identifier) => name === identifier || name.endsWith(identifier));
};

/**
 * Keep the last four characters and nothing else.
 *
 * Enough for somebody to say "yes, that is the account I meant"; not enough
 * for the record to be the thing itself.
 */
export function maskTail(value: string, keep = 4): string {
  const trimmed = value.trim();
  if (trimmed.length <= keep) return '*'.repeat(trimmed.length);
  return '*'.repeat(Math.min(trimmed.length - keep, 12)) + trimmed.slice(-keep);
}

/** Free text may still carry a number somebody typed into it. */
export function redactText(value: string): string {
  return value
    // Iranian mobile numbers, in either digit set — including the leading
    // zero and the country code written in Persian digits, which is how they
    // are actually typed here.
    .replace(/(?:\+?[9۹][8۸]|[0۰])?[9۹][\d۰-۹]{9}/g, REDACTED)
    // Ten-digit national ids and postal codes standing alone.
    .replace(/(?<![\d۰-۹])[\d۰-۹]{10}(?![\d۰-۹])/g, REDACTED)
    // IBANs.
    .replace(/IR[\d۰-۹]{24}/gi, REDACTED)
    // Card numbers, spaced or not.
    .replace(/(?:[\d۰-۹]{4}[ -]?){4}/g, REDACTED);
}

/**
 * A value safe to write into a record.
 *
 * Recurses, so a secret three objects down is still removed, and stops at a
 * sensible depth because an audit payload that deep is a bug rather than a
 * record.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => redact(entry, depth + 1));
  if (typeof value !== 'object') return REDACTED;

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSecret(key)) {
      out[key] = REDACTED;
      continue;
    }
    // A flag is not an identifier, however it is spelled: `showPhone` is a
    // preference, not a telephone number.
    const identifying = typeof entry === 'string' || typeof entry === 'number';
    if (identifying && isIdentifier(key)) {
      out[key] = alreadyMasked(entry) ? entry : REDACTED;
      continue;
    }
    out[key] = redact(entry, depth + 1);
  }
  return out;
}

/**
 * Whether a payload would lose anything by being redacted.
 *
 * Used by the tests rather than by the product: a payload that changes is one
 * that was carrying something it should not have been.
 */
export const carriesSensitive = (value: unknown): boolean =>
  JSON.stringify(redact(value)) !== JSON.stringify(redact(redact(value)));
