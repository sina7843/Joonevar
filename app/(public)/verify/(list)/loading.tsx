import { LoadingState } from '../../../../src/ui/states.tsx';

/* Loading state for the verification answer. */
export default function VerifyLoading() {
  return <LoadingState rows={2} label="در حال استعلام" />;
}
