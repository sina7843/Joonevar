'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '../../src/ui/button.tsx';
import { TextField } from '../../src/ui/field.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { Logo } from '../../src/ui/logo.tsx';
import { requestCodeAction, verifyCodeAction, type LoginState } from './actions.ts';

const INITIAL: LoginState = { step: 'MOBILE' };

/** Countdown for the resend button, matching the «شمارش معکوس ارسال مجدد» of §6.1. */
function useCountdown(seconds: number | undefined, key: string) {
  const [remaining, setRemaining] = useState(seconds ?? 0);
  useEffect(() => {
    setRemaining(seconds ?? 0);
  }, [seconds, key]);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return remaining;
}

export function LoginForm({ next }: { next: string | null }) {
  const [mobileState, submitMobile, mobilePending] = useActionState(requestCodeAction, INITIAL);
  const [codeState, submitCode, codePending] = useActionState(verifyCodeAction, INITIAL);

  // The code step is driven by whichever action last produced a challenge.
  const active: LoginState = codeState.challengeId ? { ...mobileState, ...codeState } : mobileState;
  const remaining = useCountdown(active.resendAfterSeconds, active.challengeId ?? '');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-xl p-lg">
      <div className="flex flex-col items-center gap-md">
        <Logo height={36} />
        <h1 className="text-h3">ورود به هم‌زیست</h1>
      </div>

      {active.message ? (
        <Alert tone={active.tone === 'error' ? 'error' : 'info'} title={active.message} />
      ) : null}

      {active.step === 'MOBILE' || !active.challengeId ? (
        <form action={submitMobile} className="space-y-lg" data-testid="mobile-form">
          <TextField
            label="شماره موبایل"
            name="mobile"
            required
            ltr
            inputMode="tel"
            autoComplete="tel"
            placeholder="09xxxxxxxxx"
            hint="کد تأیید به همین شماره پیامک می‌شود."
            data-testid="mobile-input"
            defaultValue={active.mobile ?? ''}
          />
          <Button type="submit" block disabled={mobilePending} data-testid="send-code">
            {mobilePending ? 'در حال ارسال…' : 'دریافت کد تأیید'}
          </Button>
        </form>
      ) : (
        <form action={submitCode} className="space-y-lg" data-testid="code-form">
          <input type="hidden" name="challengeId" value={active.challengeId} />
          <input type="hidden" name="mobile" value={active.mobile ?? ''} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <TextField
            label="کد تأیید"
            name="code"
            required
            ltr
            inputMode="numeric"
            autoComplete="one-time-code"
            hint={'کد به شماره ' + (active.mobile ?? '') + ' ارسال شد.'}
            data-testid="code-input"
          />
          {active.attemptsRemaining !== undefined ? (
            <p className="text-caption text-text-secondary" data-testid="attempts-remaining">
              تلاش باقی‌مانده: {active.attemptsRemaining}
            </p>
          ) : null}
          <Button type="submit" block disabled={codePending} data-testid="verify-code">
            {codePending ? 'در حال بررسی…' : 'تأیید و ورود'}
          </Button>
        </form>
      )}

      {active.challengeId ? (
        <form action={submitMobile} className="text-center">
          <input type="hidden" name="mobile" value={active.mobile ?? ''} />
          <Button tone="ghost" type="submit" disabled={remaining > 0} data-testid="resend-code">
            {remaining > 0 ? 'ارسال دوباره کد تا ' + remaining + ' ثانیه دیگر' : 'ارسال دوباره کد'}
          </Button>
        </form>
      ) : null}
    </main>
  );
}
