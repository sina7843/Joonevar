'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Shared overlay behaviour for Modal, Drawer and Bottom Sheet.
 *
 * One implementation covers all three because they differ only in placement:
 * focus moves in on open, Tab cycles inside, Escape closes, the scrim click
 * closes, and focus returns to whatever opened it.
 */
function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || panelRef.current === null) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [open, onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const target = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panelRef.current;
    target?.focus();
    document.addEventListener('keydown', onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [open, onKeyDown]);

  return panelRef;
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

function Surface({
  open,
  onClose,
  title,
  children,
  footer,
  placement,
  testId,
}: OverlayProps & { placement: string; testId: string }) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex" data-testid={testId + '-root'}>
      <div
        className="absolute inset-0"
        style={{ background: 'var(--hz-scrim)' }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        data-testid={testId}
        className={['relative z-10 bg-bg-surface p-lg shadow-lg outline-none', placement].join(' ')}
      >
        <h2 className="text-h4">{title}</h2>
        <div className="mt-md text-body-sm">{children}</div>
        {footer}
      </div>
    </div>
  );
}

export function Modal(props: OverlayProps) {
  return (
    <Surface
      {...props}
      testId="modal"
      placement="m-auto max-h-[85vh] w-[min(90vw,480px)] overflow-y-auto rounded-lg"
    />
  );
}

/** Side panel. In RTL it enters from the right, which is the natural edge. */
export function Drawer(props: OverlayProps) {
  return (
    <Surface
      {...props}
      testId="drawer"
      placement="ms-auto h-full w-[min(92vw,420px)] overflow-y-auto rounded-s-lg"
    />
  );
}

/** Mobile sheet. Same semantics as the modal, anchored to the bottom edge. */
export function BottomSheet(props: OverlayProps) {
  return (
    <Surface
      {...props}
      testId="bottom-sheet"
      placement="mt-auto w-full max-h-[80vh] overflow-y-auto rounded-t-xl"
    />
  );
}
