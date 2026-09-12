'use client';

import { useRef, useState } from 'react';
import { RichText } from './rich-text.tsx';

/**
 * The body editor.
 *
 * A toolbar that writes the marks for the author and a preview that shows the
 * result, over the same plain textarea the form already posts. The stored value
 * stays text, which is why nothing an author types can become markup: the
 * renderer builds elements from a parse, never from a string (DEC-0184).
 *
 * Deliberately not a `contenteditable` surface: that stores HTML, and storing
 * HTML from a browser means sanitising it on the way back in and trusting the
 * sanitiser forever after.
 */
interface Mark {
  readonly labelFa: string;
  readonly title: string;
  /** Wraps the selection, or starts the line when `line` is true. */
  readonly before: string;
  readonly after?: string;
  readonly line?: boolean;
}

const MARKS: readonly Mark[] = [
  { labelFa: 'پررنگ', title: 'متن پررنگ', before: '**', after: '**' },
  { labelFa: 'مورب', title: 'متن مورب', before: '*', after: '*' },
  { labelFa: 'عنوان', title: 'عنوان بخش', before: '## ', line: true },
  { labelFa: 'زیرعنوان', title: 'زیرعنوان', before: '### ', line: true },
  { labelFa: 'فهرست', title: 'فهرست نشانه‌دار', before: '- ', line: true },
  { labelFa: 'فهرست شماره‌دار', title: 'فهرست شماره‌دار', before: '1. ', line: true },
  { labelFa: 'نقل قول', title: 'نقل قول', before: '> ', line: true },
  { labelFa: 'پیوند', title: 'پیوند', before: '[', after: '](/)' },
];

export function BodyEditor({ name, defaultValue }: { name: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const [preview, setPreview] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const apply = (mark: Mark) => {
    const field = area.current;
    if (!field) return;
    const start = field.selectionStart;
    const end = field.selectionEnd;
    const selected = value.slice(start, end);

    let next: string;
    let caret: number;
    if (mark.line) {
      // A line mark belongs at the start of the line the caret sits on.
      const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      next = value.slice(0, lineStart) + mark.before + value.slice(lineStart);
      caret = end + mark.before.length;
    } else {
      next = value.slice(0, start) + mark.before + selected + (mark.after ?? '') + value.slice(end);
      caret = start + mark.before.length + selected.length;
    }
    setValue(next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="space-y-sm">
      <div className="flex items-center justify-between gap-md">
        <span className="text-label-md">متن</span>
        <button
          type="button"
          onClick={() => setPreview((on) => !on)}
          className="min-h-[var(--size-control-sm)] rounded-md border border-border-subtle px-md text-label-md"
          data-testid="body-preview-toggle"
        >
          {preview ? 'ویرایش' : 'پیش‌نمایش'}
        </button>
      </div>

      {preview ? (
        <div className="rounded-md border border-border-subtle bg-bg-surface p-lg text-body-md" data-testid="body-preview">
          <RichText source={value} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-xs" role="toolbar" aria-label="قالب‌بندی متن">
            {MARKS.map((mark) => (
              <button
                key={mark.labelFa}
                type="button"
                title={mark.title}
                onClick={() => apply(mark)}
                className="min-h-[var(--size-control-sm)] rounded-md border border-border-subtle bg-bg-surface px-md text-label-md hover:border-border-brand"
                data-testid={'body-mark-' + mark.before.trim().replace(/[^a-z0-9*#>[\]-]/gi, '') || 'body-mark'}
              >
                {mark.labelFa}
              </button>
            ))}
          </div>
          <textarea
            ref={area}
            name={name}
            rows={14}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="w-full rounded-md border border-border-subtle bg-bg-surface p-md text-body-sm text-text-primary focus:border-border-brand"
            data-testid="content-body"
          />
        </>
      )}
      <p className="text-caption text-text-secondary">
        بندها را با یک خط خالی از هم جدا کنید. عنوان با ##، فهرست با - و نقل قول با &gt; نوشته می‌شود.
      </p>
    </div>
  );
}
