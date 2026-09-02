import Link from 'next/link';
import type { ReactNode } from 'react';

export type ButtonTone = 'primary' | 'secondary' | 'ghost';

const BASE =
  'inline-flex items-center justify-center rounded-md px-lg text-label-md font-medium transition-colors ' +
  'min-h-[var(--size-control-md)] disabled:cursor-not-allowed';

const TONE: Record<ButtonTone, string> = {
  primary:
    'bg-action-primary-default text-action-primary-on hover:opacity-90 ' +
    'disabled:bg-action-primary-disabled disabled:text-text-disabled',
  secondary:
    'bg-action-secondary-default text-action-secondary-on border border-border-brand hover:bg-bg-brand-subtle ' +
    'disabled:bg-action-secondary-disabled disabled:text-text-disabled disabled:border-border-disabled',
  ghost: 'text-text-brand hover:bg-bg-brand-subtle disabled:text-text-disabled',
};

interface CommonProps {
  tone?: ButtonTone;
  block?: boolean;
  children: ReactNode;
  className?: string;
}

export function Button({
  tone = 'primary',
  block = false,
  type = 'button',
  disabled,
  children,
  className = '',
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[BASE, TONE[tone], block ? 'w-full' : '', className].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A CTA that navigates. Locked services always pair their reason with one of
 * these, so the next step is reachable rather than merely described (§5).
 */
export function ButtonLink({
  tone = 'primary',
  block = false,
  href,
  children,
  className = '',
}: CommonProps & { href: string }) {
  return (
    <Link href={href} className={[BASE, TONE[tone], block ? 'w-full' : '', className].join(' ')}>
      {children}
    </Link>
  );
}

/**
 * Dialog and form action row.
 *
 * ERRATA v2.0 of the prototype (node 395:10183) settles the RTL order: the
 * primary action sits on the right, the secondary on the left. `flex-row` in an
 * RTL document puts the first child on the right, so primary is passed first
 * and no direction override is needed.
 */
export function ActionRow({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex flex-row gap-md pt-lg">
      {primary}
      {secondary}
    </div>
  );
}
