import { StatusBadge } from '../../src/ui/status.tsx';
import { isUnusable, SAMPLE_STATUS_FA, type SampleStatusName } from '../../src/domain/microchip.ts';

/** Sample status → status-dictionary key where the custody model names it differently. */
const SAMPLE_KEY: Partial<Record<SampleStatusName, string>> = {
  IN_CUSTODY: 'COLLECTED',
  SEND_INSTRUCTED: 'SEND_INSTRUCTED',
  SHIPPED: 'SHIPPED',
  RECEIVED: 'SAMPLE_RECEIVED',
  PROCESSING: 'PROCESSING',
};

export function SampleStatusBadge({ status }: { status: SampleStatusName }) {
  const key = SAMPLE_KEY[status];
  if (key) return <StatusBadge status={key} />;
  // GAPS #4: dictionary MARKED_UNUSABLE drops the reason; INVALID/INSUFFICIENT/DAMAGED/LOST keep their own label
  return <StatusBadge tone={isUnusable(status) ? 'warning' : 'info'}>{SAMPLE_STATUS_FA[status]}</StatusBadge>;
}
