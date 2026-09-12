'use client';

import { useActionState } from 'react';
import { Button } from '../ui/button.tsx';
import { SelectField, TextField } from '../ui/field.tsx';
import { Result, submitWith } from '../vets/directory-forms.tsx';
import { MERGE_KINDS, MERGE_KIND_FA, type MergeKind } from './merge-model.ts';
import { mergeRecordAction, type MergeFormState } from './actions.ts';

const EMPTY: MergeFormState = {};

export interface MergeOption {
  readonly id: string;
  readonly nameFa: string;
  readonly version: number;
  readonly slug: string | null;
}

/**
 * Mark a duplicate — §21 (PROMPT-016).
 *
 * The expected version travels with the chosen duplicate, so a record edited by
 * someone else between opening this page and submitting it is refused instead
 * of silently merged.
 */
export function MergeForm({ kind, options }: { kind: MergeKind; options: readonly MergeOption[] }) {
  const [state, submit, pending] = useActionState(mergeRecordAction, EMPTY);

  /*
   * The duplicate's expected version travels inside its own option value rather
   * than through React state: the form then carries everything the server needs
   * the moment a choice is made, and there is no state to be half-applied.
   */
  return (
    <form onSubmit={submitWith(submit)} className="mt-lg space-y-md" data-testid="merge-form">
      <input type="hidden" name="kind" value={kind} />
      <Result state={state} testId="merge-result" />

      <SelectField
        label="رکورد تکراری"
        name="duplicate"
        required
        options={options.map((option) => ({ value: option.id + ':' + option.version, label: option.nameFa }))}
        data-testid="merge-duplicate"
      />
      <SelectField
        label="رکورد اصلی"
        name="primaryId"
        required
        options={options.map((option) => ({ value: option.id, label: option.nameFa }))}
        data-testid="merge-primary"
      />
      <TextField
        label="دلیل ادغام"
        name="reason"
        required
        maxLength={500}
        hint="در تاریخچه می‌ماند و بعداً قابل بازبینی است."
        data-testid="merge-reason"
      />
      <Button type="submit" disabled={pending} data-testid="merge-submit">
        ثبت به‌عنوان تکراری
      </Button>
    </form>
  );
}

/** Switching the directory is a plain link, so the address says what is on screen. */
export function MergeKindTabs({ current }: { current: MergeKind }) {
  return (
    <nav aria-label="نوع رکورد" className="flex flex-wrap gap-xs" data-testid="merge-kinds">
      {MERGE_KINDS.map((kind) => (
        <a
          key={kind}
          href={'/admin/merge?kind=' + kind}
          aria-current={kind === current ? 'page' : undefined}
          className={[
            'inline-flex min-h-[var(--size-control-sm)] items-center rounded-md border px-md text-label-md',
            kind === current ? 'border-border-brand text-text-brand' : 'border-border-subtle text-text-secondary',
          ].join(' ')}
          data-testid={'merge-kind-' + kind}
        >
          {MERGE_KIND_FA[kind]}
        </a>
      ))}
    </nav>
  );
}
