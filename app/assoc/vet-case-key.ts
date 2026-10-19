/**
 * Vet case values → status-dictionary key (DS *Status dictionary*). Values not
 * listed share the dictionary's name. The case type (student, licence,
 * trusted) is already the desk/queue title, so the badge carries only the stage.
 */
const VET_CASE_KEY: Record<string, string> = {
  VERIFIED_STUDENT: 'VERIFIED',
  VERIFIED_NO_LICENSE: 'VERIFIED',
  LICENSE_APPROVED_AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  TRUSTED_APPROVED_AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  ACTIVE_LICENSED_VET: 'ACTIVE',
  ACTIVE_TRUSTED_VET: 'ACTIVE',
};

export const vetCaseKey = (status: string): string => VET_CASE_KEY[status] ?? status;
