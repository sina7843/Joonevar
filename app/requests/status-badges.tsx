import { StatusBadge } from '../../src/ui/status.tsx';
import {
  REFERRAL_STATUS_FA,
  REFERRAL_STATUS_TONE,
  REQUEST_STATUS_FA,
  REQUEST_STATUS_TONE,
} from '../../src/domain/referral.ts';

/** Visit-request status through the status dictionary (owner and vet screens share it). */
export function RequestStatusBadge({ status, size }: { status: string; size?: 'md' | 'sm' }) {
  // GAPS #4: no dictionary key for CHECKED_IN; dictionary COMPLETED («تحویل انجام و مالکیت منتقل شد») is the market-order label, not a finished visit
  if (status === 'CHECKED_IN' || status === 'COMPLETED') {
    return (
      <StatusBadge tone={REQUEST_STATUS_TONE[status]} size={size}>
        {REQUEST_STATUS_FA[status]}
      </StatusBadge>
    );
  }
  return <StatusBadge status={status} size={size} />;
}

/** Referral-code status; an ACTIVE code past its deadline reads as EXPIRED. */
export function ReferralStatusBadge({ status, expired, size }: { status: string; expired: boolean; size?: 'md' | 'sm' }) {
  // GAPS #4: no dictionary key for CONSUMED
  if (status === 'CONSUMED') {
    return (
      <StatusBadge tone={REFERRAL_STATUS_TONE[status]} size={size}>
        {REFERRAL_STATUS_FA[status]}
      </StatusBadge>
    );
  }
  return <StatusBadge status={expired && status === 'ACTIVE' ? 'EXPIRED' : status} size={size} />;
}
