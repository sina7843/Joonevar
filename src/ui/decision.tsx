'use client';

import { useActionState, useId, useState, type ReactNode } from 'react';
import { Icon } from './icon.tsx';
import { Alert } from './alert.tsx';
import { Button } from './button.tsx';

/**
 * DS *DecisionDesk* outcome cards (`.hz-option` radios with a one-line
 * consequence) and *ReasonField* (audience line, draft chips, textarea,
 * counter). Field names and test ids are passed in, so each module keeps its
 * own server action contract.
 */
export interface DecisionChoice<V extends string> {
  readonly value: V;
  readonly label: string;
  readonly desc?: string;
  readonly testId?: string;
}

export function DecisionOptions<V extends string>({
  name = 'decision',
  choices,
  value,
  onChange,
  disabled,
  legend = 'نتیجه بررسی',
}: {
  name?: string;
  choices: readonly DecisionChoice<V>[];
  value: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
  legend?: string;
}) {
  return (
    <fieldset className="hz-desk__options" disabled={disabled}>
      <legend className="hz-visually-hidden">{legend}</legend>
      {choices.map((choice) => (
        <label key={choice.value} className="hz-option">
          <input
            type="radio"
            name={name}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            data-testid={choice.testId}
          />
          <span className="hz-radio__text">
            <b className="hz-radio__label">{choice.label}</b>
            {choice.desc ? <span className="hz-radio__desc">{choice.desc}</span> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ReasonField({
  name,
  label = 'دلیل',
  required = false,
  testId,
  drafts = [],
  audience = 'به کاربر نمایش داده می‌شود',
  maxLength = 500,
  defaultValue = '',
  hint,
}: {
  name: string;
  label?: string;
  required?: boolean;
  testId?: string;
  drafts?: readonly string[];
  /** null hides the audience line (internal-only reasons). */
  audience?: string | null;
  maxLength?: number;
  defaultValue?: string;
  hint?: string;
}) {
  const id = useId();
  const [text, setText] = useState(defaultValue);
  const near = text.length >= maxLength * 0.9;
  return (
    <div className="hz-reason">
      <div className="hz-field">
        <div className="hz-field__label-row">
          <label className="hz-field__label" htmlFor={id}>
            {label}
            {required ? (
              <span className="hz-field__req" aria-hidden="true">
                *
              </span>
            ) : (
              <span className="hz-field__opt">(اختیاری)</span>
            )}
          </label>
          {audience ? (
            <span className="hz-reason__audience hz-reason__audience--public" id={id + '-aud'}>
              <Icon name="eye" size="xs" />
              {audience}
            </span>
          ) : null}
        </div>
        {drafts.length > 0 ? (
          <div className="hz-filterbar" role="group" aria-label="دلیل‌های آماده">
            {drafts.map((draft) => (
              <button
                key={draft}
                type="button"
                className="hz-chip"
                aria-pressed={text === draft}
                onClick={() => setText(draft)}
              >
                {draft}
              </button>
            ))}
          </div>
        ) : null}
        <textarea
          id={id}
          name={name}
          className="hz-textarea"
          rows={3}
          required={required}
          aria-required={required || undefined}
          maxLength={maxLength}
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-describedby={(audience ? id + '-aud ' : '') + id + '-count'}
          data-testid={testId}
        />
        <div className="hz-field__foot">
          <span className="hz-field__hint">{hint ?? ''}</span>
          <span
            className={near ? 'hz-field__counter hz-field__counter--near' : 'hz-field__counter'}
            id={id + '-count'}
            aria-live="polite"
          >
            {text.length.toLocaleString('fa-IR') + ' از ' + maxLength.toLocaleString('fa-IR') + ' نویسه'}
          </span>
        </div>
      </div>
    </div>
  );
}

export interface DecisionFormState {
  readonly ok?: boolean;
  readonly message?: string;
  readonly tone?: 'success' | 'error';
}

/**
 * The whole decision panel of a desk: outcome cards → reason (required for any
 * outcome listed in `reasonFor`) → one primary whose label follows the choice.
 * No outcome is preselected (P10 › Default). The module's own server action,
 * hidden fields and test ids are passed in unchanged.
 */
export function DecisionForm<V extends string>({
  action,
  hidden,
  choices,
  reasonName,
  reasonTestId,
  reasonFor,
  reasonLabel,
  drafts,
  submitTestId,
  formTestId,
  audience,
  name = 'decision',
  children,
}: {
  /** The module's server action; its state shape is a superset of DecisionFormState. */
  action: (state: never, form: FormData) => Promise<DecisionFormState>;
  hidden: Record<string, string | number>;
  choices: readonly DecisionChoice<V>[];
  reasonName: string;
  reasonTestId?: string;
  /** Outcomes that require a reason; others send no reason field. */
  reasonFor: readonly V[];
  reasonLabel?: (value: V) => string;
  drafts?: readonly string[];
  submitTestId?: string;
  formTestId?: string;
  audience?: string | null;
  name?: string;
  /** Extra fields shown under the reason (per module). */
  children?: (value: V | null) => ReactNode;
}) {
  const [state, submit, pending] = useActionState(
    action as unknown as (state: DecisionFormState, form: FormData) => Promise<DecisionFormState>,
    {} as DecisionFormState,
  );
  const [value, setValue] = useState<V | null>(null);
  const needsReason = value !== null && reasonFor.includes(value);
  const chosen = choices.find((choice) => choice.value === value);
  return (
    <form action={submit} className="flex flex-col gap-lg" data-testid={formTestId}>
      {Object.entries(hidden).map(([key, val]) => (
        <input key={key} type="hidden" name={key} value={val} />
      ))}
      {state.message ? (
        <Alert tone={state.ok || state.tone === 'success' ? 'success' : 'error'} title={state.message} />
      ) : null}
      <DecisionOptions name={name} choices={choices} value={value} onChange={setValue} disabled={pending} />
      {needsReason ? (
        <ReasonField
          key={value}
          name={reasonName}
          label={reasonLabel ? reasonLabel(value) : 'دلیل'}
          required
          testId={reasonTestId}
          drafts={drafts}
          audience={audience}
        />
      ) : null}
      {children ? children(value) : null}
      <Button
        type="submit"
        size="lg"
        block
        wrap
        disabled={pending || value === null}
        loading={pending}
        loadingLabel="در حال ثبت…"
        data-testid={submitTestId}
      >
        {chosen ? 'ثبت تصمیم: ' + chosen.label : 'یک تصمیم انتخاب کنید'}
      </Button>
    </form>
  );
}
