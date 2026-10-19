'use client';

import { useActionState, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert } from '../../../../src/ui/alert.tsx';
import { Button, ButtonLink, StickyActionBar } from '../../../../src/ui/button.tsx';
import { Card } from '../../../../src/ui/card.tsx';
import { Field, FileField, SelectField, TextField } from '../../../../src/ui/field.tsx';
import { Stepper } from '../../../../src/ui/stepper.tsx';
import { KeyValueList } from '../../../../src/ui/key-value.tsx';
import { SectionHeader } from '../../../../src/ui/section-header.tsx';
import { BreedPicker } from '../../../../src/ui/breed-picker.tsx';
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
const STEPS = ['گونه و نژاد', 'جنسیت و تولد', 'مشخصات ظاهری', 'تصویر', 'میکروچیپ', 'منبع شناسایی و مرور'] as const;

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

/** P07: the step heading inside the step card (the eye goes here, not to the Stepper). */
const stepContext = (step: number): string => 'مرحله ' + step.toLocaleString('fa-IR') + ' از ۶، ' + STEPS[step - 1];

function StepHead({ step }: { step: number }) {
  return (
    <div className="mb-lg">
      <p className="text-caption text-text-secondary">مرحله {step.toLocaleString('fa-IR')} از ۶</p>
      <h2 className="text-h3">{STEPS[step - 1]}</h2>
    </div>
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
  const originForm = useRef<HTMLFormElement>(null);
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
          پس از ثبت این حیوان، به پرونده قبلی برمی‌گردید و نسب دوباره بررسی می‌شود؛ پیش‌نویس و کدهای واردشده شما حفظ شده
          است.{' '}
          <Link href={'/animals/' + parentOf + '/edit?step=6'} className="hz-link">
            بازگشت به پرونده قبلی
          </Link>
        </Alert>
      ) : null}

      <Card>
        <Stepper
          label="مراحل ثبت"
          steps={STEPS.map((label) => ({ label }))}
          current={step}
          onSelect={(target) => setStep(target)}
        />
      </Card>

      <div className="grid items-start gap-xl lg:grid-cols-12">
        <div className="min-w-0 space-y-lg lg:col-span-7">
          <Result state={saveState} />

          {step === 1 ? (
            <Card>
              <StepHead step={1} />
              <form action={save} className="space-y-lg" data-testid="step-1">
                <input type="hidden" name="animalId" value={animal.id} />
                <input type="hidden" name="step" value="2" />
                <TextField
                  label="نام حیوان"
                  name="name"
                  required
                  defaultValue={animal.name ?? ''}
                  data-testid="animal-name"
                />
                <Field label="گونه" required hint="در حال حاضر فقط ثبت سگ پشتیبانی می‌شود.">
                  {({ inputId, describedBy }) => (
                    <input
                      id={inputId}
                      aria-describedby={describedBy}
                      value="سگ"
                      readOnly
                      disabled
                      className="hz-input"
                    />
                  )}
                </Field>
                <BreedPicker breeds={breeds} defaultValue={animal.breedId} required testId="animal-breed" />
                <StickyActionBar label="کنش‌های مرحله" context={stepContext(1)}>
                  <Button size="lg" type="submit" disabled={savePending} data-testid="step-1-continue">
                    ادامه
                  </Button>
                </StickyActionBar>
              </form>
            </Card>
          ) : null}

          {step === 2 ? (
            <Card>
              <StepHead step={2} />
              <form action={save} className="space-y-lg" data-testid="step-2">
                <input type="hidden" name="animalId" value={animal.id} />
                <input type="hidden" name="step" value="3" />
                <fieldset className="hz-fieldset">
                  <legend className="hz-field__label">
                    جنسیت
                    <span className="hz-field__req" aria-hidden="true">
                      *
                    </span>
                  </legend>
                  <div className="hz-choice-group hz-choice-group--inline">
                    {(
                      [
                        ['MALE', 'نر'],
                        ['FEMALE', 'ماده'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className="hz-radio">
                        <input
                          type="radio"
                          name="sex"
                          value={value}
                          defaultChecked={animal.sex === value}
                          data-testid={'sex-' + value}
                        />
                        <span className="hz-radio__text">
                          <span>{label}</span>
                        </span>
                      </label>
                    ))}
                  </div>
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
                <label className="hz-check">
                  <input
                    type="checkbox"
                    name="birthDateApproximate"
                    defaultChecked={animal.birthDateApproximate}
                    data-testid="birth-approximate"
                  />
                  <span className="hz-check__text">
                    <span className="hz-check__label">تاریخ تولد تقریبی است</span>
                  </span>
                </label>
                <StickyActionBar label="کنش‌های مرحله" context={stepContext(2)}>
                  <Button size="lg" type="submit" disabled={savePending} data-testid="step-2-continue">
                    ادامه
                  </Button>
                  <Button size="lg" tone="secondary" type="button" onClick={back}>
                    مرحله قبل
                  </Button>
                </StickyActionBar>
              </form>
            </Card>
          ) : null}

          {step === 3 ? (
            <Card>
              <StepHead step={3} />
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
                  رنگ و نشانه‌های ظاهری اینجا اختیاری است و اظهار شما ثبت می‌شود. در مراجعه، دامپزشک معتمد همین‌ها را با
                  دیدن حیوان تکمیل یا اصلاح می‌کند و از آن پس رسمی و غیرقابل‌تغییر می‌شوند.
                </Alert>
                <StickyActionBar label="کنش‌های مرحله" context={stepContext(3)}>
                  <Button size="lg" type="submit" disabled={savePending} data-testid="step-3-continue">
                    ادامه
                  </Button>
                  <Button size="lg" tone="secondary" type="button" onClick={back}>
                    مرحله قبل
                  </Button>
                </StickyActionBar>
              </form>
            </Card>
          ) : null}

          {step === 4 ? (
            <Card>
              <StepHead step={4} />
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
                {animal.hasPhoto ? <span className="hz-tag hz-tag--neutral">تصویر ذخیره شده است</span> : null}
                <Button tone="secondary" type="submit" block disabled={photoPending} data-testid="upload-photo">
                  {photoPending ? 'در حال بارگذاری…' : 'بارگذاری تصویر'}
                </Button>
              </form>
              <div className="mt-lg">
                <StickyActionBar label="کنش‌های مرحله" context={stepContext(4)}>
                  <Button size="lg" type="button" onClick={next} data-testid="step-4-continue">
                    ادامه
                  </Button>
                  <Button size="lg" tone="secondary" type="button" onClick={back}>
                    مرحله قبل
                  </Button>
                </StickyActionBar>
              </div>
            </Card>
          ) : null}

          {step === 5 ? (
            <Card>
              <StepHead step={5} />
              <form action={save} className="space-y-lg" data-testid="step-5">
                <input type="hidden" name="animalId" value={animal.id} />
                <input type="hidden" name="step" value="6" />
                <fieldset className="hz-fieldset">
                  <legend className="hz-field__label">آیا حیوان در حال حاضر میکروچیپ دارد؟</legend>
                  <div className="hz-choice-group hz-choice-group--inline">
                    {(
                      [
                        ['yes', 'بله'],
                        ['no', 'خیر'],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className="hz-radio">
                        <input
                          type="radio"
                          name="hasMicrochip"
                          value={value}
                          checked={hasMicrochip === (value === 'yes')}
                          onChange={() => setHasMicrochip(value === 'yes')}
                          data-testid={'has-microchip-' + value}
                        />
                        <span className="hz-radio__text">
                          <span>{label}</span>
                        </span>
                      </label>
                    ))}
                  </div>
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
                <StickyActionBar label="کنش‌های مرحله" context={stepContext(5)}>
                  <Button size="lg" type="submit" disabled={savePending} data-testid="step-5-continue">
                    ادامه
                  </Button>
                  <Button size="lg" tone="secondary" type="button" onClick={back}>
                    مرحله قبل
                  </Button>
                </StickyActionBar>
              </form>
            </Card>
          ) : null}

          {step === 6 ? (
            <div className="space-y-lg">
              <Card>
                <StepHead step={6} />
                <SectionHeader size="sm" title="نوع ثبت حیوان هم‌زیست" />
                {/*
                 * Choosing the kind of record is the whole of this step, so the
                 * choice saves itself. A separate "save" button asked the person to
                 * confirm a radio they had already pressed.
                 */}
                <form
                  ref={originForm}
                  action={save}
                  className="hz-choice-group hz-choice-group--stack mt-lg"
                  data-testid="origin-form"
                >
                  <input type="hidden" name="animalId" value={animal.id} />
                  <input type="hidden" name="step" value="6" />
                  <label className="hz-option hz-option--card">
                    <input
                      type="radio"
                      name="origin"
                      value="G0"
                      checked={origin === 'G0'}
                      onChange={() => {
                        setOrigin('G0');
                        originForm.current?.requestSubmit();
                      }}
                      data-testid="origin-G0"
                    />
                    <span className="hz-option__text">
                      <span className="hz-option__label">حیوان G0 بدون اسناد هویتی</span>
                      <span className="hz-option__desc">
                        برای حیوانی که سند هویتی، شجره‌نامه یا سابقه نسل قابل‌ارائه ندارد.
                      </span>
                    </span>
                  </label>
                  <label className="hz-option hz-option--card">
                    <input
                      type="radio"
                      name="origin"
                      value="INTERNAL_G1PLUS"
                      checked={origin === 'INTERNAL_G1PLUS'}
                      onChange={() => {
                        setOrigin('INTERNAL_G1PLUS');
                        originForm.current?.requestSubmit();
                      }}
                      data-testid="origin-INTERNAL_G1PLUS"
                    />
                    <span className="hz-option__text">
                      <span className="hz-option__label">حیوان G1+ با نسب ثبت‌شده در هم‌زیست</span>
                      <span className="hz-option__desc">
                        کد شجره‌نامه پدر و مادر در هم‌زیست Resolve می‌شود و نسل از همان رکوردها محاسبه می‌شود.
                      </span>
                    </span>
                  </label>
                  <label className="hz-option hz-option--card">
                    <input
                      type="radio"
                      name="origin"
                      value="FOREIGN_PEDIGREE"
                      checked={origin === 'FOREIGN_PEDIGREE'}
                      onChange={() => {
                        setOrigin('FOREIGN_PEDIGREE');
                        originForm.current?.requestSubmit();
                      }}
                      data-testid="origin-FOREIGN_PEDIGREE"
                    />
                    <span className="hz-option__text">
                      <span className="hz-option__label">Export Pedigree — شجره‌نامه صادرشده خارج از هم‌زیست</span>
                      <span className="hz-option__desc">
                        هر دو روی برگه و پشت برگه لازم است و پس از بارگذاری هر دو، پرونده برای بررسی به انجمن می‌رود.
                      </span>
                    </span>
                  </label>
                </form>
              </Card>

              {origin === 'INTERNAL_G1PLUS' ? (
                <Card>
                  <SectionHeader size="sm" title="کدهای شجره‌نامه" />
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
                    <Button
                      tone="secondary"
                      type="submit"
                      block
                      disabled={lineagePending}
                      data-testid="resolve-lineage"
                    >
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
                  <SectionHeader size="sm" title="Export Pedigree" />
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
                <SectionHeader size="sm" title="مرور و ثبت" />
                <p className="mt-sm text-caption text-text-secondary">
                  ثبت اولیه حیوان با صدور برگه ثبتی، شناسه رسمی یا شجره‌نامه یکی نیست.
                </p>
                <Result state={registerState} />
                <form action={register} className="mt-lg">
                  <input type="hidden" name="animalId" value={animal.id} />
                  <StickyActionBar label="کنش‌های مرحله" context={stepContext(6)}>
                    <Button size="lg" type="submit" disabled={registerPending} aria-busy={registerPending || undefined} data-testid="register-animal">
                      {registerPending ? 'در حال ثبت…' : 'ثبت حیوان هم‌زیست'}
                    </Button>
                    <Button size="lg" tone="secondary" type="button" onClick={back}>
                      مرحله قبل
                    </Button>
                  </StickyActionBar>
                </form>
              </Card>
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-xl lg:col-span-5" aria-label="خلاصه پیش‌نویس">
          <Card>
            <SectionHeader size="sm" title="خلاصه پیش‌نویس" />
            <div className="mt-md">
              <KeyValueList
                rows={[
                  { key: 'گونه', value: 'سگ' },
                  {
                    key: 'نژاد',
                    value: breeds.find((breed) => breed.id === animal.breedId)?.nameFa,
                  },
                  { key: 'نام', value: animal.name },
                  {
                    key: 'جنس',
                    value: animal.sex === 'MALE' ? 'نر' : animal.sex === 'FEMALE' ? 'ماده' : null,
                  },
                  {
                    key: 'تاریخ تولد',
                    value: animal.birthDate ? (
                      <bdi dir="ltr">{animal.birthDate + (animal.birthDateApproximate ? ' ~' : '')}</bdi>
                    ) : null,
                  },
                  { key: 'رنگ', value: animal.color },
                  { key: 'تصویر', value: animal.hasPhoto ? 'ذخیره شده' : null },
                  {
                    key: 'میکروچیپ اعلامی',
                    value: animal.declaredMicrochipNumber ? (
                      <bdi dir="ltr">{animal.declaredMicrochipNumber}</bdi>
                    ) : null,
                  },
                ]}
              />
            </div>
            <p className="mt-md text-caption text-text-secondary">
              هر مرحله جدا ذخیره می‌شود؛ هر وقت برگردید از همین مرحله ادامه می‌دهید.
            </p>
          </Card>
          <Card>
            <SectionHeader size="sm" title="پس از ثبت" />
            <ol className="mt-md list-decimal space-y-sm ps-xl text-body-sm text-text-secondary">
              <li>حیوان را برای کاشت یا تأیید میکروچیپ و نمونه‌گیری نزد دامپزشک معتمد ببرید.</li>
              <li>پس از تأیید دامپزشک، مشخصات رسمی ثبت می‌شود و برگه ثبتی قابل درخواست است.</li>
            </ol>
            <div className="hz-card__footer">
              <Link href="/vets" className="hz-link hz-link--standalone">
                فهرست دامپزشکان معتمد
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
