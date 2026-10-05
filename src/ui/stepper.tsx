import Link from 'next/link';
import { Icon } from './icon.tsx';

/**
 * Stepper — DS *Stepper* (`.hz-stepper`, P07). Horizontal from 768px; below it
 * the compact form («مرحله ۲ از ۶» + name + bar + «بعدی: …»). Done steps link
 * back (a `href` on the server, `onSelect` inside a client form); upcoming
 * steps are never links.
 */
export interface StepperStep {
  readonly label: string;
  readonly href?: string;
}

const fa = (n: number) => n.toLocaleString('fa-IR');

export function Stepper({
  steps,
  current,
  label,
  onSelect,
}: {
  steps: readonly StepperStep[];
  /** 1-based. */
  current: number;
  label: string;
  onSelect?: (step: number) => void;
}) {
  const total = steps.length;
  const now = steps[current - 1];
  const next = steps[current];
  return (
    <>
      <div className="hz-progress hz-hide-md">
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={current}
          aria-valuetext={'مرحله ' + fa(current) + ' از ' + fa(total) + ': ' + (now?.label ?? '')}
          className="hz-progress__label"
        >
          <b>{now?.label}</b>
          <span>{'مرحله ' + fa(current) + ' از ' + fa(total)}</span>
        </div>
        <div className="hz-progress__track">
          <div className="hz-progress__fill" style={{ width: (current / total) * 100 + '%' }} />
        </div>
        {next ? <span className="hz-progress__next">{'بعدی: ' + next.label}</span> : null}
      </div>
      <nav aria-label={label} className="hz-show-md">
        <ol className="hz-stepper">
          {steps.map((step, index) => {
            const n = index + 1;
            const done = n < current;
            const isCurrent = n === current;
            return (
              <li
                key={step.label}
                className={['hz-step', done ? 'hz-step--done' : '', isCurrent ? 'hz-step--current' : ''].join(' ').trim()}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className="hz-step__dot">{done ? <Icon name="check" size="xs" /> : fa(n)}</span>
                {done && step.href ? (
                  <Link className="hz-step__link" href={step.href}>
                    {step.label}
                    <span className="hz-visually-hidden"> (انجام‌شده)</span>
                  </Link>
                ) : done && onSelect ? (
                  <button type="button" className="hz-step__link" onClick={() => onSelect(n)}>
                    {step.label}
                    <span className="hz-visually-hidden"> (انجام‌شده)</span>
                  </button>
                ) : (
                  <span>{step.label}</span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
}
