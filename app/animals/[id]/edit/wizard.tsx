'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { Alert } from '../../../../src/ui/alert.tsx';
import { ActionRow, Button, ButtonLink } from '../../../../src/ui/button.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Field, FileField, SelectField, TextField } from '../../../../src/ui/field.tsx';
import { StatusBadge } from '../../../../src/ui/status.tsx';
import {
  registerAnimalAction,
  registerMissingParentAction,
  resolveLineageAction,
  saveAnimalStepAction,
  uploadAnimalPhotoAction,
  type FormState,
} from '../../actions.ts';

const EMPTY: FormState = {};

/** The six steps of the approved PET-004…PET-008 form. */
const STEPS = [
  'گونه و نژاد',
  'جنسیت و تولد',
  'مشخصات ظاهری',
  'تصویر',
  'میکروچیپ',
  'منبع شناسایی و مرور',
] as const;

export interface WizardAnimal {
  readonly id: string;
  readonly name: string | null;
  readonly breedId: string | null;
  readonly sex: 'MALE' | 'FEMALE' | null;
  readonly birthDate: string | null;
  readonly birthDateApproximate: boolean;
  readonly color: string | null;
  readonly markings: string | null;
  readonly hasPhoto: boolean;
  readonly declaredMicrochipNumber: string | null;
  readonly origin: 'G0' | 'INTERNAL_G1PLUS' | 'FOREIGN_PEDIGREE';
  readonly generation: number;
  readonly draftStep: number;
  readonly ownPedigreeCode: string | null;
  readonly sirePedigreeCode: string | null;
  readonly damPedigreeCode: string | null;
  readonly lastLineageState: string | null;
}

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert
      tone={state.tone === 'success' ? 'success' : state.tone === 'error' ? 'error' : 'info'}
      title={state.message}
    />
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="hz-rail flex gap-sm" aria-label="مراحل ثبت">
      {STEPS.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        return (
          <li key={label} className="shrink-0">
            <span
              aria-current={step === current ? 'step' : undefined}
              className={[
                'flex size-8 items-center justify-center rounded-full border text-label-sm',
                step === current
                  ? 'border-border-brand bg-action-primary-default text-action-primary-on'
                  : done
                    ? 'border-status-success-border text-status-success-text'
                    : 'border-border-subtle text-text-secondary',
              ].join(' ')}
            >
              {done ? '✓' : step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function AnimalWizard({
  animal,
  breeds,
  parentOf,
}: {
  animal: WizardAnimal;
  breeds: ReadonlyArray<{ id: string; nameFa: string; nameEn: string }>;
  parentOf: string | null;
}) {
  const [step, setStep] = useState(Math.min(Math.max(animal.draftStep, 1), 6));
  const [saveState, save, savePending] = useActionState(saveAnimalStepAction, EMPTY);
  const [photoState, uploadPhoto, photoPending] = useActionState(uploadAnimalPhotoAction, EMPTY);
  const [lineageState, resolveLineage, lineagePending] = useActionState(resolveLineageAction, EMPTY);
  const [registerState, register, registerPending] = useActionState(registerAnimalAction, EMPTY);
  // A genuinely missing parent stores G0, but the owner still chose the
  // internal-lineage route: the panel, the codes and the CTA must survive a
  // reload, otherwise the way back to the missing parent disappears.
  const [origin, setOrigin] = useState(
    animal.origin === 'G0' && (animal.sirePedigreeCode !== null || animal.damPedigreeCode !== null)
      ? ('INTERNAL_G1PLUS' as const)
      : animal.origin,
  );
  const [hasMicrochip, setHasMicrochip] = useState(animal.declaredMicrochipNumber !== null);

  const back = () => setStep((value) => Math.max(value - 1, 1));

  /**
   * The step advances only after the server has actually stored it.
   *
   * Advancing on click unmounted the step's form before the browser had
   * collected its fields, so the action arrived with empty values and the
   * owner's answers were lost. The saved `draftStep` is now the only thing
   * that moves the form forward.
   */
  const [lastSavedStep, setLastSavedStep] = useState(animal.draftStep);
  if (animal.draftStep !== lastSavedStep) {
    setLastSavedStep(animal.draftStep);
    setStep(Math.min(Math.max(animal.draftStep, 1), 6));
  }
  const next = () => setStep((value) => Math.min(value + 1, 6));

  return (
    <div className="space-y-lg" data-testid="animal-wizard">
      {parentOf ? (
        <Alert tone="info" title="ثبت والد گمشده">
          پس از ثبت این حیوان، به پرونده قبلی برمی‌گردید و نسب دوباره بررسی می‌شود؛ پیش‌نویس و کدهای واردشده
          شما حفظ شده است.{' '}
          <Link href={'/animals/' + parentOf + '/edit?step=6'} className="text-text-brand underline underline-offset-4">
            بازگشت به پرونده قبلی
          </Link>
        </Alert>
      ) : null}

      <Stepper current={step} />
      <p className="text-caption text-text-secondary">
        مرحله {step} از ۶ · {STEPS[step - 1]}
      </p>

      <Result state={saveState} />

      {step === 1 ? (
        <Card>
          <form action={save} className="space-y-lg" data-testid="step-1">
            <input type="hidden" name="animalId" value={animal.id} />
            <input type="hidden" name="step" value="2" />
            <TextField label="نام حیوان" name="name" defaultValue={animal.name ?? ''} data-testid="animal-name" />
            <Field label="گونه" required hint="در حال حاضر فقط ثبت سگ پشتیبانی می‌شود.">
              {({ inputId, describedBy }) => (
                <input
                  id={inputId}
                  aria-describedby={describedBy}
                  value="سگ"
                  readOnly
                  className="w-full rounded-md border border-border-disabled bg-bg-disabled px-md py-sm text-body-sm text-text-disabled"
                />
              )}
            </Field>
            <SelectField
              label="نژاد"
              name="breedId"
              required
              hint="جست‌وجو با نام فارسی یا انگلیسی انجام می‌شود."
              defaultValue={animal.breedId ?? ''}
              options={breeds.map((breed) => ({ value: breed.id, label: breed.nameFa + ' · ' + breed.nameEn }))}
              data-testid="animal-breed"
            />
            <Button type="submit" block disabled={savePending} data-testid="step-1-continue">
              ادامه
            </Button>
          </form>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <form action={save} className="space-y-lg" data-testid="step-2">
            <input type="hidden" name="animalId" value={animal.id} />
            <input type="hidden" name="step" value="3" />
            <fieldset className="space-y-sm">
              <legend className="text-label-md">
                جنسیت <span className="text-status-error-text">*</span>
              </legend>
              {(
                [
                  ['MALE', 'نر'],
                  ['FEMALE', 'ماده'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-sm text-body-sm">
                  <input
                    type="radio"
                    name="sex"
                    value={value}
                    defaultChecked={animal.sex === value}
                    className="size-[var(--size-selection-md)]"
                    data-testid={'sex-' + value}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <TextField
              label="تاریخ تولد"
              name="birthDate"
              type="date"
              required
              ltr
              defaultValue={animal.birthDate ?? ''}
              data-testid="animal-birth-date"
            />
            <label className="flex items-center gap-sm text-label-md">
              <input
                type="checkbox"
                name="birthDateApproximate"
                defaultChecked={animal.birthDateApproximate}
                className="size-[var(--size-selection-md)]"
                data-testid="birth-approximate"
              />
              تاریخ تولد تقریبی است
            </label>
            <ActionRow
              primary={
                <Button type="submit" disabled={savePending} data-testid="step-2-continue">
                  ادامه
                </Button>
              }
              secondary={
                <Button tone="secondary" type="button" onClick={back}>
                  بازگشت
                </Button>
              }
            />
          </form>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <form action={save} className="space-y-lg" data-testid="step-3">
            <input type="hidden" name="animalId" value={animal.id} />
            <input type="hidden" name="step" value="4" />
            <TextField label="رنگ" name="color" defaultValue={animal.color ?? ''} data-testid="animal-color" />
            <TextField
              label="نشانه‌های ظاهری"
              name="markings"
              hint="مواردی را بنویسید که در تشخیص حیوان کمک می‌کنند."
              defaultValue={animal.markings ?? ''}
              data-testid="animal-markings"
            />
            <Alert tone="info" title="این اطلاعات اعلامی است">
              رنگ و نشانه‌های ظاهری اختیاری است و به‌عنوان اطلاعات اعلام‌شده توسط کاربر و تأییدنشده ثبت می‌شود.
            </Alert>
            <ActionRow
              primary={
                <Button type="submit" disabled={savePending} data-testid="step-3-continue">
                  ادامه
                </Button>
              }
              secondary={
                <Button tone="secondary" type="button" onClick={back}>
                  بازگشت
                </Button>
              }
            />
          </form>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <Result state={photoState} />
          <form action={uploadPhoto} className="space-y-lg" data-testid="step-4">
            <input type="hidden" name="animalId" value={animal.id} />
            <FileField
              label="تصویر حیوان"
              name="photo"
              accept="image/jpeg,image/png"
              maxBytes={5 * 1024 * 1024}
              hint="JPG یا PNG تا ۵ مگابایت. این تصویر خصوصی است."
              testId="animal-photo"
            />
            {animal.hasPhoto ? <StatusBadge tone="success">تصویر ذخیره شده است</StatusBadge> : null}
            <Button tone="secondary" type="submit" block disabled={photoPending} data-testid="upload-photo">
              {photoPending ? 'در حال بارگذاری…' : 'بارگذاری تصویر'}
            </Button>
          </form>
          <div className="mt-lg">
            <ActionRow
              primary={
                <Button type="button" onClick={next} data-testid="step-4-continue">
                  ادامه
                </Button>
              }
              secondary={
                <Button tone="secondary" type="button" onClick={back}>
                  بازگشت
                </Button>
              }
            />
          </div>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <form action={save} className="space-y-lg" data-testid="step-5">
            <input type="hidden" name="animalId" value={animal.id} />
            <input type="hidden" name="step" value="6" />
            <fieldset className="space-y-sm">
              <legend className="text-label-md">آیا حیوان در حال حاضر میکروچیپ دارد؟</legend>
              {(
                [
                  ['yes', 'بله'],
                  ['no', 'خیر'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-sm text-body-sm">
                  <input
                    type="radio"
                    name="hasMicrochip"
                    value={value}
                    checked={hasMicrochip === (value === 'yes')}
                    onChange={() => setHasMicrochip(value === 'yes')}
                    className="size-[var(--size-selection-md)]"
                    data-testid={'has-microchip-' + value}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            {hasMicrochip ? (
              <TextField
                label="شماره میکروچیپ"
                name="declaredMicrochipNumber"
                ltr
                inputMode="numeric"
                defaultValue={animal.declaredMicrochipNumber ?? ''}
                data-testid="declared-microchip"
              />
            ) : null}
            <Alert tone="warning" title="این شماره هنوز رسمی نیست">
              شماره میکروچیپ فقط پس از اسکن و تأیید دامپزشک معتمد رسمی می‌شود.
            </Alert>
            <ActionRow
              primary={
                <Button type="submit" disabled={savePending} data-testid="step-5-continue">
                  ادامه
                </Button>
              }
              secondary={
                <Button tone="secondary" type="button" onClick={back}>
                  بازگشت
                </Button>
              }
            />
          </form>
        </Card>
      ) : null}

      {step === 6 ? (
        <div className="space-y-lg">
          <Card>
            <h2 className="text-label-lg">نوع ثبت حیوان هم‌زیست</h2>
            <form action={save} className="mt-lg space-y-md" data-testid="origin-form">
              <input type="hidden" name="animalId" value={animal.id} />
              <input type="hidden" name="step" value="6" />
              <label className="flex items-start gap-sm text-body-sm">
                <input
                  type="radio"
                  name="origin"
                  value="G0"
                  checked={origin === 'G0'}
                  onChange={() => setOrigin('G0')}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid="origin-G0"
                />
                <span>
                  <span className="block text-label-md">حیوان G0 بدون اسناد هویتی</span>
                  <span className="text-caption text-text-secondary">
                    برای حیوانی که سند هویتی، شجره‌نامه یا سابقه نسل قابل‌ارائه ندارد.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-sm text-body-sm">
                <input
                  type="radio"
                  name="origin"
                  value="INTERNAL_G1PLUS"
                  checked={origin === 'INTERNAL_G1PLUS'}
                  onChange={() => setOrigin('INTERNAL_G1PLUS')}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid="origin-INTERNAL_G1PLUS"
                />
                <span>
                  <span className="block text-label-md">حیوان G1+ با نسب ثبت‌شده در هم‌زیست</span>
                  <span className="text-caption text-text-secondary">
                    کد شجره‌نامه پدر و مادر در هم‌زیست Resolve می‌شود و نسل از همان رکوردها محاسبه می‌شود.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-sm text-body-sm">
                <input
                  type="radio"
                  name="origin"
                  value="FOREIGN_PEDIGREE"
                  checked={origin === 'FOREIGN_PEDIGREE'}
                  onChange={() => setOrigin('FOREIGN_PEDIGREE')}
                  className="mt-1 size-[var(--size-selection-md)]"
                  data-testid="origin-FOREIGN_PEDIGREE"
                />
                <span>
                  <span className="block text-label-md">شجره‌نامه صادرشده خارج از هم‌زیست</span>
                  <span className="text-caption text-text-secondary">
                    روی برگه و پشت برگه بارگذاری و برای بررسی به انجمن ارسال می‌شود.
                  </span>
                </span>
              </label>
              <Button tone="secondary" type="submit" block disabled={savePending} data-testid="save-origin">
                ذخیره نوع ثبت
              </Button>
            </form>
          </Card>

          {origin === 'INTERNAL_G1PLUS' ? (
            <Card>
              <h3 className="text-label-lg">کدهای شجره‌نامه</h3>
              <Result state={lineageState} />
              <form action={resolveLineage} className="mt-lg space-y-lg" data-testid="lineage-form">
                <input type="hidden" name="animalId" value={animal.id} />
                <TextField
                  label="کد شجره‌نامه خود حیوان"
                  name="ownPedigreeCode"
                  ltr
                  defaultValue={animal.ownPedigreeCode ?? ''}
                  data-testid="own-pedigree-code"
                />
                <TextField
                  label="کد شجره‌نامه پدر"
                  name="sirePedigreeCode"
                  ltr
                  defaultValue={animal.sirePedigreeCode ?? ''}
                  data-testid="sire-pedigree-code"
                />
                <TextField
                  label="کد شجره‌نامه مادر"
                  name="damPedigreeCode"
                  ltr
                  defaultValue={animal.damPedigreeCode ?? ''}
                  data-testid="dam-pedigree-code"
                />
                <Button tone="secondary" type="submit" block disabled={lineagePending} data-testid="resolve-lineage">
                  {lineagePending ? 'در حال بررسی…' : 'بررسی نسب'}
                </Button>
              </form>

              <p className="mt-lg text-body-sm">
                نسل محاسبه‌شده: <span data-testid="computed-generation">G{animal.generation}</span>
              </p>
              <p className="mt-2xs text-caption text-text-secondary">
                نسل فقط‌خواندنی است و از رکورد والدین محاسبه می‌شود؛ امکان انتخاب یا افزایش دستی وجود ندارد.
              </p>

              {animal.lastLineageState === 'PARENT_MISSING' ? (
                <form action={registerMissingParentAction} className="mt-lg">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <Button tone="secondary" type="submit" block data-testid="register-missing-parent">
                    ثبت والد گمشده
                  </Button>
                </form>
              ) : null}
            </Card>
          ) : null}

          {origin === 'FOREIGN_PEDIGREE' ? (
            <Card>
              <h3 className="text-label-lg">شجره‌نامه خارجی</h3>
              <p className="mt-sm text-body-sm text-text-secondary">
                پس از ثبت حیوان، مدرک را در همان پرونده بارگذاری و برای بررسی انجمن ارسال کنید.
              </p>
              <div className="mt-lg">
                <ButtonLink tone="secondary" href={'/animals/' + animal.id + '/foreign-pedigree'} block>
                  رفتن به بارگذاری مدرک
                </ButtonLink>
              </div>
            </Card>
          ) : null}

          <Card>
            <h3 className="text-label-lg">مرور و ثبت</h3>
            <p className="mt-sm text-caption text-text-secondary">
              ثبت اولیه حیوان با صدور برگه ثبتی، شناسه رسمی یا شجره‌نامه یکی نیست.
            </p>
            <Result state={registerState} />
            <form action={register} className="mt-lg">
              <input type="hidden" name="animalId" value={animal.id} />
              <Button type="submit" block disabled={registerPending} data-testid="register-animal">
                {registerPending ? 'در حال ثبت…' : 'ثبت حیوان هم‌زیست'}
              </Button>
            </form>
            <div className="mt-md">
              <Button tone="secondary" type="button" block onClick={back}>
                بازگشت
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
