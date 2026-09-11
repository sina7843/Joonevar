'use client';

import { Alert } from '../../src/ui/alert.tsx';
import { Button } from '../../src/ui/button.tsx';

/**
 * A public page failed to render (Requirements-Phase-2 §22).
 *
 * Nothing about the failure reaches the visitor: the message and digest belong
 * in the server log. The shell stays in place, so the visitor can still leave.
 */
export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-(--size-content-md) space-y-lg" data-testid="public-error">
      <Alert tone="error" title="این صفحه باز نشد">
        مشکلی در نمایش این صفحه پیش آمد. چند لحظه بعد دوباره تلاش کنید.
      </Alert>
      <Button onClick={() => reset()}>تلاش دوباره</Button>
    </div>
  );
}
