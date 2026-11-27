import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from './icon.tsx';
import type { IconName } from './icon-paths.ts';

/**
 * Button and ButtonLink — DS *Button* (`.hz-btn`).
 *
 * Five tones, three sizes (sm 36 for OpsShell desktop only, md 44 default,
 * lg 48 for primary and mobile block buttons). At most one primary per view.
 * `loading` sets `aria-busy`, swaps the start icon for a spinner and shows the
 * in-progress verb; the tone colour is kept.
 */
export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'destructive-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface CommonProps {
  tone?: ButtonTone;
  size?: ButtonSize;
  block?: boolean;
  /** Data-driven labels in narrow block buttons may wrap (`.hz-btn--wrap`). */
  wrap?: boolean;
  iconStart?: IconName;
  /** Directional start icons (back, forward) flip with `dir`. */
  mirrorIcon?: boolean;
  children: ReactNode;
  className?: string;
}

export function buttonClass({
  tone = 'primary',
  size = 'md',
  block = false,
  wrap = false,
  className = '',
}: Pick<CommonProps, 'tone' | 'size' | 'block' | 'wrap' | 'className'>): string {
  return [
    'hz-btn',
    'hz-btn--' + tone,
    size === 'md' ? '' : 'hz-btn--' + size,
    block ? 'hz-btn--block' : '',
    wrap ? 'hz-btn--wrap' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

function Start({ icon, size, mirror }: { icon?: IconName; size: ButtonSize; mirror?: boolean }) {
  return icon ? <Icon name={icon} size={size === 'sm' ? 'xs' : 'sm'} mirror={mirror} /> : null;
}

export function Button({
  tone = 'primary',
  size = 'md',
  block = false,
  wrap = false,
  iconStart,
  mirrorIcon,
  loading = false,
  loadingLabel = 'در حال ارسال…',
  type = 'button',
  disabled,
  children,
  className = '',
  ...rest
}: CommonProps & { loading?: boolean; loadingLabel?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={buttonClass({ tone, size, block, wrap, className })}
      {...rest}
    >
      {loading ? (
        <>
          <span className="hz-spinner" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        <>
          <Start icon={iconStart} size={size} mirror={mirrorIcon} />
          {children}
        </>
      )}
    </button>
  );
}

/**
 * A CTA that navigates — same look on `<a>`. Locked services always pair their
 * reason with one of these, so the next step is reachable (§5).
 */
export function ButtonLink({
  tone = 'primary',
  size = 'md',
  block = false,
  wrap = false,
  iconStart,
  mirrorIcon,
  href,
  children,
  className = '',
  ...rest
}: CommonProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={buttonClass({ tone, size, block, wrap, className })} {...rest}>
      <Start icon={iconStart} size={size} mirror={mirrorIcon} />
      {children}
    </Link>
  );
}

/**
 * Action row — DS *ActionRow*: start = primary, end = secondary. `flex-row` in
 * an RTL document puts the first child at the start, so primary is passed
 * first. `sticky` keeps the row at the bottom of the screen below 768px.
 */
export function ActionRow({
  primary,
  secondary,
  children,
  sticky = false,
  className = '',
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  /** Further actions after the secondary (e.g. a destructive outline last). */
  children?: ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div className={['hz-action-row', sticky ? 'hz-action-row--sticky max-md:fixed max-md:inset-x-0 max-md:[inset-block-end:0]' : 'pt-lg', className].join(' ')}>
      {primary}
      {secondary}
      {children}
    </div>
  );
}

/**
 * DS *StickyActionBar*: the step's or payment's main action pinned to the
 * bottom of a phone screen, with an optional summary (where you are, what you
 * pay) and a note for a disabled primary. From 768 it is an in-content block.
 * The shell hides its tab bar while one is on the page (never two bars).
 */
export function StickyActionBar({
  context,
  total,
  totalUnset = false,
  note,
  noteId,
  label = 'کنش‌های اصلی',
  overTabs = false,
  className = '',
  children,
}: {
  context?: ReactNode;
  total?: ReactNode;
  /** The total is «تعیین‌نشده»: muted, never «۰ تومان». */
  totalUnset?: boolean;
  note?: ReactNode;
  /** Referenced by a disabled primary's `aria-describedby`. */
  noteId?: string;
  label?: string;
  /**
   * Record pages (K9, K11) keep the tab bar and sit just above it; wizards and
   * payments (the default) hide the tab bar instead.
   */
  overTabs?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        // Below 768 the bar is pinned to the viewport rather than to its parent (often a short form), so it
        // really stays reachable; <html> reserves the space (app/layout.tsx).
        'hz-sticky-bar max-md:fixed max-md:inset-x-0',
        overTabs ? 'max-md:[inset-block-end:var(--tabbar)]' : 'max-md:[inset-block-end:0]',
        className,
      ]
        .join(' ')
        .trim()}
      data-over-tabs={overTabs || undefined}
      role="region"
      aria-label={label}
    >
      {context || total ? (
        <div className="hz-sticky-bar__summary">
          {context ? <span className="hz-sticky-bar__context">{context}</span> : <span />}
          {total ? <span className={totalUnset ? 'hz-sticky-bar__total hz-sticky-bar__total--unset' : 'hz-sticky-bar__total'}>{total}</span> : null}
        </div>
      ) : null}
      <div className="hz-sticky-bar__actions">{children}</div>
      {note ? (
        <p className="hz-sticky-bar__note" id={noteId}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
