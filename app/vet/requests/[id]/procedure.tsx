'use client';

import { useActionState } from 'react';
import { Card } from '../../../../src/ui/card.tsx';
import { Button } from '../../../../src/ui/button.tsx';
import { Alert } from '../../../../src/ui/alert.tsx';
import { SelectField, TextField } from '../../../../src/ui/field.tsx';
import { READ_METHOD_FA, type ChipReadMethod } from '../../../../src/domain/microchip.ts';
import {
  bindExistingChipAction,
  confirmImplantAction,
  markSampleUnusableAction,
  readChipAction,
  recordSamplingAction,
  rereadChipAction,
  resampleAction,
  type VetFormState,
} from '../../actions.ts';

const EMPTY: VetFormState = {};

const METHODS: readonly ChipReadMethod[] = [
  'BLUETOOTH_READER',
  'MOBILE_READER',
  'PACKAGE_BARCODE',
  'MANUAL',
];

function Result({ state }: { state: VetFormState }) {
  if (!state.message) return null;
  return <Alert tone={state.ok ? (state.tone === 'info' ? 'info' : 'success') : 'error'} title={state.message} />;
}

/**
 * Reading a number — §12.1.
 *
 * The four approved methods are offered together and all write the same field.
 * Manual entry is not a fallback of last resort: it is one of the four, which
 * is what keeps an unconfigured reader from stopping the visit.
 */
function ReadForm({
  requestId,
  action,
  testId,
  label,
  readerReady,
}: {
  requestId: string;
  action: typeof readChipAction;
  testId: string;
  label: string;
  readerReady: boolean;
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid={testId}>
      <input type="hidden" name="requestId" value={requestId} />
      <Result state={state} />
      <SelectField
        label="روش خواندن"
        name="method"
        required
        defaultValue="MANUAL"
        options={METHODS.map((value) => ({
          value,
          label:
            READ_METHOD_FA[value] +
            (!readerReady && (value === 'BLUETOOTH_READER' || value === 'MOBILE_READER')
              ? ' (اتصال دستگاه پیکربندی نشده)'
              : ''),
        }))}
        data-testid={testId + '-method'}
      />
      <TextField
        label="شماره میکروچیپ"
        name="number"
        required
        ltr
        inputMode="numeric"
        hint="۱۵ رقم. اگر دستگاه پاسخ نداد، همین شماره را دستی وارد کنید."
        data-testid={testId + '-number'}
      />
      <Button type="submit" block disabled={pending} data-testid={testId + '-submit'}>
        {pending ? 'در حال بررسی…' : label}
      </Button>
    </form>
  );
}

function OneButtonForm({
  requestId,
  action,
  testId,
  label,
  tone = 'primary',
}: {
  requestId: string;
  action: typeof confirmImplantAction;
  testId: string;
  label: string;
  tone?: 'primary' | 'secondary';
}) {
  const [state, submit, pending] = useActionState(action, EMPTY);
  return (
    <form action={submit} className="space-y-lg" data-testid={testId}>
      <input type="hidden" name="requestId" value={requestId} />
      <Result state={state} />
      <Button tone={tone} type="submit" block disabled={pending} data-testid={testId + '-submit'}>
        {pending ? 'در حال ثبت…' : label}
      </Button>
    </form>
  );
}

export function ChipPanel({
  requestId,
  serviceType,
  readerReady,
  step,
}: {
  requestId: string;
  serviceType: string;
  readerReady: boolean;
  /** Where the chip work has actually got to, read from the stored record. */
  step: 'READ' | 'IMPLANT' | 'REREAD' | 'BINDABLE' | 'DONE';
}) {
  return (
    <Card>
      <h3 className="text-label-lg">میکروچیپ</h3>
      {readerReady ? null : (
        <p className="mt-md text-caption text-text-secondary" data-testid="reader-not-configured">
          اتصال ریدر بلوتوث و ریدر موبایل هنوز پیکربندی نشده است. بارکد بسته و ورود دستی همین حالا کار می‌کنند و
          شماره ثبت‌شده تفاوتی ندارد.
        </p>
      )}

      {step === 'DONE' ? (
        <p className="mt-lg text-body-sm" data-testid="chip-step-done">
          کار میکروچیپ این پرونده تعیین‌تکلیف شده است.
        </p>
      ) : null}

      {step === 'READ' ? (
        <div className="mt-lg">
          <ReadForm
            requestId={requestId}
            action={readChipAction}
            testId="chip-read"
            readerReady={readerReady}
            label={serviceType === 'MICROCHIP_IMPLANT' ? 'ثبت سریال پیش از کاشت' : 'خواندن و بررسی شماره'}
          />
        </div>
      ) : null}

      {step === 'IMPLANT' ? (
        <div className="mt-lg space-y-lg">
          <Alert tone="info" title="سریال پیش از کاشت ثبت شد">
            پس از کاشت، سریال دوباره خوانده و با همین مقدار تطبیق داده می‌شود.
          </Alert>
          <OneButtonForm
            requestId={requestId}
            action={confirmImplantAction}
            testId="confirm-implant"
            label="کاشت انجام شد"
          />
        </div>
      ) : null}

      {step === 'REREAD' ? (
        <div className="mt-lg">
          <ReadForm
            requestId={requestId}
            action={rereadChipAction}
            testId="chip-reread"
            readerReady={readerReady}
            label="خواندن مجدد و اتصال دائمی"
          />
        </div>
      ) : null}

      {step === 'BINDABLE' ? (
        <div className="mt-lg space-y-lg">
          <Alert tone="info" title="چیپ فیزیکی بدون رکورد سیستمی">
            پس از کنترل یکتایی و نبود چیپ دیگر در طول عمر، همین شماره به این حیوان متصل می‌شود.
          </Alert>
          <OneButtonForm
            requestId={requestId}
            action={bindExistingChipAction}
            testId="bind-existing"
            label="ثبت و اتصال دائمی این شماره"
          />
        </div>
      ) : null}
    </Card>
  );
}

export function SamplePanel({
  requestId,
  hasLiveSample,
  unusableSampleId,
}: {
  requestId: string;
  hasLiveSample: boolean;
  /** Set when the last sample was recorded unusable and a new one is due. */
  unusableSampleId: string | null;
}) {
  const [sampleState, submitSample, samplePending] = useActionState(recordSamplingAction, EMPTY);
  const [resampleState, submitResample, resamplePending] = useActionState(resampleAction, EMPTY);

  if (unusableSampleId !== null) {
    return (
      <Card>
        <h3 className="text-label-lg">نمونه‌گیری مجدد</h3>
        <p className="mt-md text-caption text-text-secondary">
          نمونه و کد قبلی در سابقه می‌مانند. کد جدید فقط پس از انجام واقعی نمونه‌گیری صادر می‌شود و این مسیر
          کاشت دوباره میکروچیپ نیست.
        </p>
        <form action={submitResample} className="mt-lg space-y-lg" data-testid="resample-form">
          <input type="hidden" name="requestId" value={requestId} />
          <Result state={resampleState} />
          <TextField label="توضیح (اختیاری)" name="note" data-testid="resample-note" />
          <Button type="submit" block disabled={resamplePending} data-testid="submit-resample">
            {resamplePending ? 'در حال ثبت…' : 'ثبت نمونه‌گیری مجدد'}
          </Button>
        </form>
      </Card>
    );
  }

  if (hasLiveSample) return null;

  return (
    <Card>
      <h3 className="text-label-lg">نمونه‌گیری خون</h3>
      <p className="mt-md text-caption text-text-secondary">
        در هر دو مسیر کاشت و تأیید، نمونه خون اجباری است. کد رهگیری فقط پس از انجام واقعی نمونه‌گیری صادر
        می‌شود.
      </p>
      <form action={submitSample} className="mt-lg space-y-lg" data-testid="sampling-form">
        <input type="hidden" name="requestId" value={requestId} />
        <Result state={sampleState} />
        <TextField label="توضیح (اختیاری)" name="note" data-testid="sampling-note" />
        <Button type="submit" block disabled={samplePending} data-testid="submit-sampling">
          {samplePending ? 'در حال ثبت…' : 'ثبت نمونه‌گیری انجام‌شده'}
        </Button>
      </form>
    </Card>
  );
}

export function UnusableSampleForm({
  requestId,
  sampleId,
}: {
  requestId: string;
  sampleId: string;
}) {
  const [state, submit, pending] = useActionState(markSampleUnusableAction, EMPTY);
  return (
    <form action={submit} className="mt-lg space-y-lg" data-testid="unusable-form">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="sampleId" value={sampleId} />
      <Result state={state} />
      <SelectField
        label="وضعیت نمونه"
        name="status"
        required
        options={[
          { value: 'INVALID', label: 'نامعتبر' },
          { value: 'INSUFFICIENT', label: 'ناکافی' },
          { value: 'DAMAGED', label: 'خراب' },
          { value: 'LOST', label: 'مفقود' },
        ]}
        data-testid="unusable-status"
      />
      <TextField label="دلیل" name="reason" required data-testid="unusable-reason" />
      <Button tone="secondary" type="submit" block disabled={pending} data-testid="submit-unusable">
        {pending ? 'در حال ثبت…' : 'ثبت غیرقابل‌استفاده بودن نمونه'}
      </Button>
    </form>
  );
}
