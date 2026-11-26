'use client';

import { useRef, useState } from 'react';
import { Icon } from './icon.tsx';

/**
 * DS *Identifier* › copy: `copy` → `check` for 2 s with a polite «کپی شد»; with
 * no clipboard permission it selects the id and says «شناسه را انتخاب و کپی کنید».
 */
export function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const copy = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      const bdi = button.current?.parentElement?.querySelector('bdi');
      if (bdi) {
        const range = document.createRange();
        range.selectNodeContents(bdi);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 2000);
  };

  return (
    <>
      <button ref={button} type="button" className="hz-icon-btn" aria-label="کپی شناسه" onClick={copy} data-testid="copy-identifier">
        <Icon name={state === 'copied' ? 'check' : 'copy'} size="sm" className={state === 'copied' ? 'text-status-success-text' : undefined} />
      </button>
      <span className="hz-visually-hidden" aria-live="polite">
        {state === 'copied' ? 'کپی شد' : state === 'failed' ? 'شناسه را انتخاب و کپی کنید' : ''}
      </span>
    </>
  );
}
