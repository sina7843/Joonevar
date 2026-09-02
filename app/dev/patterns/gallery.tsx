'use client';

import { useState } from 'react';
import { Alert } from '../../../src/ui/alert.tsx';
import { ActionRow, Button } from '../../../src/ui/button.tsx';
import { AnimalCard, Card, LockedServiceCard, RequestCard } from '../../../src/ui/card.tsx';
import { LocationField, SelectField, TextField } from '../../../src/ui/field.tsx';
import { BottomSheet, Drawer, Modal } from '../../../src/ui/overlay.tsx';
import { Identifier, StatusBadge } from '../../../src/ui/status.tsx';
import {
  EmptyState,
  LoadingState,
  NeedsCorrectionState,
  NetworkErrorState,
  SyntheticNotice,
  WaitingState,
} from '../../../src/ui/states.tsx';
import { Timeline } from '../../../src/ui/timeline.tsx';
import { LOCK_KYC_REQUIRED, LOCK_REGISTRATION_SHEET_REQUIRED } from '../../../src/domain/eligibility/locks.ts';

/**
 * SYNTHETIC review data. Codes use an obvious fixture shape and the numbers are
 * not real records. Nothing here is read from or written to the database.
 */
const LONG_FA =
  'برای دریافت شجره‌نامه، ابتدا باید برگه ثبتی همین حیوان صادر شده باشد و نمونه خون دریافت‌شده در مسیر مرکز ژنتیک' +
  ' بررسی شود؛ تا آن زمان این خدمت با ذکر دلیل، پیش‌نیاز بعدی و مسیر مستقیم اقدام، قفل باقی می‌ماند.';

export function PatternGallery() {
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [nationalId, setNationalId] = useState('');
  const [address, setAddress] = useState('');

  const nationalIdError =
    nationalId.length > 0 && !/^\d{10}$/.test(nationalId) ? 'کد ملی باید دقیقاً ده رقم باشد.' : undefined;

  return (
    <main className="mx-auto max-w-3xl space-y-xl p-lg">
      <header className="space-y-sm">
        <h1 className="text-h3">الگوهای رابط کاربری</h1>
        <p className="text-body-sm text-text-secondary">
          این صفحه فقط برای بررسی الگوها در مرورگر است و بخشی از محصول نیست.
        </p>
      </header>

      <SyntheticNotice>
        <div className="space-y-md">
          <div className="flex flex-wrap gap-sm">
            <StatusBadge tone="neutral">پرونده اولیه</StatusBadge>
            <StatusBadge tone="info">در حال بررسی</StatusBadge>
            <StatusBadge tone="success">تأیید شده</StatusBadge>
            <StatusBadge tone="warning">نیازمند اصلاح</StatusBadge>
            <StatusBadge tone="error">رد شده</StatusBadge>
          </div>
          <p className="text-body-sm">
            شناسه‌ها در متن فارسی خوانا می‌مانند: <Identifier label="کد مراجعه:" value="HZ-7K3M9QRPTX" /> و{' '}
            <Identifier label="کد نمونه:" value="SM-4B8HJ2NDVC" />.
          </p>
        </div>
      </SyntheticNotice>

      <section className="space-y-md" aria-labelledby="h-forms">
        <h2 id="h-forms" className="text-h4">
          فرم و خطای دسترس‌پذیر
        </h2>
        <Card>
          <div className="space-y-lg">
            <TextField
              label="کد ملی"
              required
              ltr
              inputMode="numeric"
              hint="ده رقم، بدون خط تیره."
              value={nationalId}
              onChange={(event) => setNationalId(event.target.value)}
              error={nationalIdError}
              data-testid="national-id"
            />
            <SelectField
              label="نژاد"
              required
              options={[
                { value: 'german-shepherd', label: 'ژرمن شپرد' },
                { value: 'labrador-retriever', label: 'لابرادور رتریور' },
                { value: 'sarabi', label: 'سگ سرابی' },
              ]}
            />
            <LocationField
              label="نشانی محل سکونت"
              hint="خالی‌بودن این بخش، تکمیل حساب و ثبت حیوان را قفل نمی‌کند."
              mapAvailable={false}
              value={address}
              onChange={setAddress}
            />
            <ActionRow
              primary={<Button tone="primary">تأیید</Button>}
              secondary={<Button tone="secondary">انصراف</Button>}
            />
          </div>
        </Card>
      </section>

      <section className="space-y-md" aria-labelledby="h-states">
        <h2 id="h-states" className="text-h4">
          حالت‌ها
        </h2>
        <LoadingState rows={2} />
        <EmptyState title="موردی وجود ندارد" description="پس از ثبت اولین درخواست، این فهرست پر می‌شود." />
        <WaitingState
          title="در انتظار بررسی انجمن"
          owner="ASSOCIATION"
          detail="زمان ثابتی برای پایان بررسی وعده داده نمی‌شود."
        />
        <NeedsCorrectionState reason="تصویر ارسالی خوانا نیست؛ داده و فایل معتبر قبلی حفظ شده است." correctionHref="/dev/patterns" />
        <NetworkErrorState retryHref="/dev/patterns" />
        <Alert tone="warning" title="هشدار فاصله جفت‌گیری">
          آخرین تاریخ تأییدشده دوطرفه ۱۰ شهریور ۱۴۰۵ است و بازه هشدار تا ۱۰ اسفند ۱۴۰۵ ادامه دارد. ادامه مسیر
          همچنان ممکن است.
        </Alert>
      </section>

      <section className="space-y-lg" aria-labelledby="h-locks">
        <h2 id="h-locks" className="text-h4">
          سرویس قفل‌شده
        </h2>
        <LockedServiceCard serviceLabel="ثبت حیوان هم‌زیست" lock={LOCK_KYC_REQUIRED} />
        <LockedServiceCard serviceLabel="دریافت شجره‌نامه" lock={LOCK_REGISTRATION_SHEET_REQUIRED} />
        <Card>
          <p className="text-body-sm">{LONG_FA}</p>
        </Card>
      </section>

      <section className="space-y-md" aria-labelledby="h-cards">
        <h2 id="h-cards" className="text-h4">
          کارت‌ها
        </h2>
        <AnimalCard
          name="نمونه ساختگی — حیوان آزمایشی"
          speciesBreed="سگ · ژرمن شپرد"
          petId={null}
          status={{ tone: 'info', label: 'پرونده اولیه' }}
          href="/dev/patterns"
        />
        <RequestCard
          title="کاشت یا تأیید میکروچیپ"
          requestCode="REQ-000123"
          animalName="نمونه ساختگی — حیوان آزمایشی"
          status={{ tone: 'warning', label: 'در حال بررسی' }}
          owner="VET"
          deadlineFa="۲۶ شهریور ۱۴۰۵"
          resumeHref="/dev/patterns"
        />
      </section>

      <section className="space-y-md" aria-labelledby="h-timeline">
        <h2 id="h-timeline" className="text-h4">
          تاریخچه
        </h2>
        <Timeline
          items={[
            {
              id: '1',
              title: 'ثبت درخواست مراجعه',
              whenFa: '۲۰ شهریور ۱۴۰۵',
              status: { tone: 'success', label: 'انجام شد' },
              owner: 'USER',
              summary: 'کد مراجعه صادر شد و مهلت آن ثبت شده است.',
              href: '/dev/patterns',
              ctaLabel: 'مشاهده',
            },
            {
              id: '2',
              title: 'پذیرش در محل',
              whenFa: '—',
              status: { tone: 'neutral', label: 'در انتظار' },
              owner: 'VET',
              summary: 'پس از مراجعه، دامپزشک معتمد کد را بررسی می‌کند.',
              href: '/dev/patterns',
              ctaLabel: 'جزئیات',
            },
          ]}
        />
      </section>

      <section className="space-y-md" aria-labelledby="h-overlays">
        <h2 id="h-overlays" className="text-h4">
          لایه‌های روی صفحه
        </h2>
        <div className="flex flex-wrap gap-md">
          <Button onClick={() => setModal(true)} data-testid="open-modal">
            باز کردن Modal
          </Button>
          <Button tone="secondary" onClick={() => setDrawer(true)} data-testid="open-drawer">
            باز کردن Drawer
          </Button>
          <Button tone="secondary" onClick={() => setSheet(true)} data-testid="open-sheet">
            باز کردن Bottom Sheet
          </Button>
        </div>

        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="تأیید اقدام"
          footer={
            <ActionRow
              primary={
                <Button tone="primary" onClick={() => setModal(false)} data-testid="modal-primary">
                  تأیید
                </Button>
              }
              secondary={
                <Button tone="secondary" onClick={() => setModal(false)} data-testid="modal-secondary">
                  انصراف
                </Button>
              }
            />
          }
        >
          در چیدمان راست‌به‌چپ، اقدام اصلی سمت راست و اقدام فرعی سمت چپ قرار می‌گیرد.
        </Modal>

        <Drawer open={drawer} onClose={() => setDrawer(false)} title="جزئیات">
          محتوای کشویی برای نمایش جزئیات یک رکورد.
        </Drawer>

        <BottomSheet open={sheet} onClose={() => setSheet(false)} title="انتخاب">
          الگوی موبایل برای انتخاب یا تأیید کوتاه.
        </BottomSheet>
      </section>
    </main>
  );
}
