'use client';

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ICON_PATHS } from './icon-paths.ts';

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

const CloseButton = ({ onClose }: { onClose: () => void }) => (
  <button type="button" className="hz-icon-btn" aria-label="بستن" onClick={onClose}>
    <svg className="hz-icon hz-icon--md" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <path d={ICON_PATHS.x.regular} />
    </svg>
  </button>
);

/**
 * Modal — DS *Modal*: scrim + a centring layer + `.hz-modal` (head, body,
 * foot). Enter: fade and scale from 0.98 (bundle), off under reduced motion.
 */
export function Modal({ open, onClose, title, children, footer }: OverlayProps) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div data-testid="modal-root">
      <div className="hz-scrim" onClick={onClose} aria-hidden="true" />
      <div className="hz-modal-layer">
        <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid="modal" className="hz-modal outline-none">
          <div className="hz-modal__head">
            <h2 className="hz-modal__title">{title}</h2>
            <CloseButton onClose={onClose} />
          </div>
          <div className="hz-modal__body">{children}</div>
          {footer ? <div className="hz-modal__foot">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** Side panel — DS *Drawer*: at the inline end (left in RTL) for details and filters. */
export function Drawer({ open, onClose, title, children, footer }: OverlayProps) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div data-testid="drawer-root">
      <div className="hz-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid="drawer" className="hz-drawer hz-drawer--full-mobile outline-none">
        <div className="hz-drawer__head">
          <h2 className="hz-drawer__title">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="hz-drawer__body">{children}</div>
        {footer ? <div className="hz-drawer__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Mobile sheet — DS *BottomSheet*: same semantics as the modal, pinned to the bottom edge. */
export function BottomSheet({ open, onClose, title, children, footer }: OverlayProps) {
  const panelRef = useOverlay(open, onClose);
  if (!open) return null;
  return (
    <div data-testid="bottom-sheet-root">
      <div className="hz-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} data-testid="bottom-sheet" className="hz-sheet outline-none">
        <div className="hz-sheet__handle" aria-hidden="true" />
        <div className="hz-sheet__head">
          <h2 className="hz-sheet__title">{title}</h2>
          <CloseButton onClose={onClose} />
        </div>
        <div className="hz-sheet__body">{children}</div>
        {footer ? <div className="hz-sheet__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
