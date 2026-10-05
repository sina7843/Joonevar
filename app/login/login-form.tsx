'use client';

import { useActionState, useEffect, useState } from 'react';
import { Button } from '../../src/ui/button.tsx';
import { TextField } from '../../src/ui/field.tsx';
import { Alert } from '../../src/ui/alert.tsx';
import { Logo } from '../../src/ui/logo.tsx';
import { Icon } from '../../src/ui/icon.tsx';
import Link from 'next/link';
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

  const codeStep = !(active.step === 'MOBILE' || !active.challengeId);

  /*
   * K8 (P07 single step): cream chrome with the logo and the way back, the
   * symbol, the title and one white card per step («مرحله ۱ از ۲»), the
   * anti-phishing note, and the slim footer.
   */
  return (
    <div className="flex min-h-dvh flex-col bg-bg-page">
      <header className="hz-site-header">
        <div className="hz-container">
          <div className="hz-site-header__bar">
            <Link href="/" aria-label="همزیست — صفحه اصلی">
              <Logo size="responsive" />
            </Link>
            <div className="hz-site-header__end">
              <Link href="/" className="hz-link hz-link--standalone">
                <Icon name="arrowLeft" size="xs" mirror />
                بازگشت به همزیست
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="hz-container flex flex-1 flex-col items-center gap-xl py-s40 outline-none">
        <div className="flex max-w-[520px] flex-col items-center gap-md text-center">
          <Logo variant="symbol" height={64} />
          <h1 className="hz-h1">ورود یا ثبت‌نام در همزیست</h1>
          <p className="hz-body-lg">با شماره موبایل خود وارد شوید. اگر با این شماره حسابی ندارید، پس از تأیید کد ساخته می‌شود.</p>
        </div>

        <div className="w-full max-w-[440px] space-y-lg">
          {active.message && !(active.tone === 'error' && active.step === 'MOBILE') ? (
            <Alert tone={active.tone === 'error' ? 'error' : 'info'} title={active.message} />
          ) : null}

          <section className="hz-card" aria-labelledby="login-step">
            <p className="hz-overline">{codeStep ? 'مرحله ۲ از ۲' : 'مرحله ۱ از ۲'}</p>
            <h2 id="login-step" className="hz-h3 mb-lg">
              {codeStep ? 'کد تأیید' : 'شماره موبایل'}
            </h2>

            {!codeStep ? (
              <form action={submitMobile} className="space-y-lg" data-testid="mobile-form">
                <TextField
                  label="شماره موبایل"
                  name="mobile"
                  required
                  ltr
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09xxxxxxxxx"
                  hint="کد تأیید ۶ رقمی به این شماره پیامک می‌شود."
                  /*
                   * A refusal of this step is the field's own error, not only a
                   * banner: the input then marks itself invalid and points at the
                   * message, which is what a screen reader follows (PROMPT-016).
                   */
                  error={active.tone === 'error' && active.step === 'MOBILE' ? active.message : undefined}
                  data-testid="mobile-input"
                  defaultValue={active.mobile ?? ''}
                />
                <Button type="submit" size="lg" block loading={mobilePending} loadingLabel="در حال ارسال…" data-testid="send-code">
                  دریافت کد تأیید
                </Button>
              </form>
            ) : (
              <form action={submitCode} className="space-y-lg" data-testid="code-form">
                <input type="hidden" name="challengeId" value={active.challengeId} />
                <input type="hidden" name="mobile" value={active.mobile ?? ''} />
                {next ? <input type="hidden" name="next" value={next} /> : null}
                <p className="hz-body-sm text-text-secondary">
                  کد ۶ رقمی به <bdi dir="ltr" className="hz-id">{active.mobile ?? ''}</bdi> پیامک شد.
                </p>
                <TextField
                  label="کد تأیید ۶ رقمی"
                  name="code"
                  required
                  ltr
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="text-center tracking-[0.5em]"
                  data-testid="code-input"
                />
                {active.attemptsRemaining !== undefined ? (
                  <p className="hz-caption" data-testid="attempts-remaining">
                    تلاش باقی‌مانده: {active.attemptsRemaining}
                  </p>
                ) : null}
                <Button type="submit" size="lg" block loading={codePending} loadingLabel="در حال بررسی…" data-testid="verify-code">
                  تأیید و ورود
                </Button>
              </form>
            )}

            {codeStep ? (
              <form action={submitMobile} className="mt-md flex justify-center">
                <input type="hidden" name="mobile" value={active.mobile ?? ''} />
                <Button tone="ghost" type="submit" disabled={remaining > 0} iconStart="clock" data-testid="resend-code">
                  {remaining > 0 ? 'ارسال دوباره کد تا ' + remaining.toLocaleString('fa-IR') + ' ثانیه دیگر' : 'ارسال دوباره کد'}
                </Button>
              </form>
            ) : null}
          </section>

          <p className="flex items-start justify-center gap-xs text-center text-body-sm text-status-info-text">
            <Icon name="info" size="sm" />
            همزیست هرگز کد تأیید را تلفنی یا در پیام از شما نمی‌خواهد. کد را به کسی ندهید.
          </p>
        </div>
      </main>

      <footer className="hz-site-footer">
        <div className="hz-container">
          <div className="hz-site-footer__bottom !mt-0 !border-0 !pt-0">
            <span>© ۱۴۰۵ همزیست</span>
            <Link className="hz-link" href="/contact">
              تماس با ما
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
