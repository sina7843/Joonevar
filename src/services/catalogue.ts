/**
 * The service pages of Requirements-Phase-2 §18 (PROMPT-013).
 *
 * Each service says what it is, who it is for, what has to be true first, what
 * steps it takes, which documents it needs, what it costs and what a visitor
 * can do next. Three things are deliberately absent:
 *
 *  - no price is written here. Every fee is the key of a managed setting, read
 *    at request time, and an unconfigured fee is shown as unconfigured rather
 *    than as free (§22, DEC-0171 for the same rule on packages);
 *  - no duration, waiting time or appointment. §18 allows a time only where
 *    real data exists, and none does, so nothing here promises one;
 *  - no new flow. Every call to action points at the Phase 1 route that already
 *    performs the service, so a public page never becomes a second way in.
 */
import {
  LOCK_KENNEL_NEEDS_SHEET,
  LOCK_KYC_REQUIRED,
  LOCK_MEMBERSHIP_REQUIRED,
  LOCK_PERMIT_NEEDS_PEDIGREE,
  LOCK_PUPPY_CARD_NEEDS_PERMIT,
  LOCK_REGISTRATION_SHEET_REQUIRED,
} from '../domain/eligibility/locks.ts';

export interface ServiceFaq {
  readonly question: string;
  readonly answer: string;
}

export interface ServiceDefinition {
  readonly slug: string;
  readonly titleFa: string;
  /** One sentence a visitor reads before anything else. */
  readonly summaryFa: string;
  readonly definitionFa: string;
  readonly audienceFa: string;
  /** What must already be true, in the wording of the lock catalogue (§5). */
  readonly prerequisitesFa: readonly string[];
  readonly stepsFa: readonly string[];
  readonly documentsFa: readonly string[];
  /** The managed setting the fee is read from, or null where the service has none. */
  readonly feeSettingKey: string | null;
  /** Managed text shown with the fee, where one is approved for this service. */
  readonly noticeSettingKey?: string;
  readonly faq: readonly ServiceFaq[];
  /** The Phase 1 route that actually performs it. */
  readonly cta: { readonly href: string; readonly label: string };
}

export const SERVICE_CATALOGUE: readonly ServiceDefinition[] = [
  {
    slug: 'membership',
    titleFa: 'عضویت انجمن',
    summaryFa: 'عضویت مادام‌العمر که خدمات ثبتی همزیست را برای حساب شما باز می‌کند.',
    definitionFa:
      'عضویت، حساب احرازهویت‌شده شما را به عضو انجمن تبدیل می‌کند. عضویت مادام‌العمر است: تمدید سالانه ندارد و پس از تأیید پرداخت روی سرور فعال می‌شود.',
    audienceFa: 'هر کسی که می‌خواهد برای حیوان خود برگه ثبتی، شجره‌نامه، کنل یا مجوز جفت‌گیری بگیرد.',
    prerequisitesFa: [LOCK_KYC_REQUIRED.nextPrerequisite],
    stepsFa: [
      'ورود با شماره موبایل و کد یک‌بارمصرف.',
      'تکمیل اطلاعات هویتی و بارگذاری تصویر کارت ملی برای بررسی.',
      'پرداخت هزینه عضویت و تأیید آن روی سرور.',
      'فعال‌شدن عضویت و صدور شماره عضویت.',
    ],
    documentsFa: ['تصویر کارت ملی'],
    feeSettingKey: 'fee.membership_toman',
    faq: [
      {
        question: 'عضویت تمدید می‌خواهد؟',
        answer: 'خیر. عضویت مادام‌العمر است و هزینه تمدید سالانه‌ای در همزیست وجود ندارد.',
      },
      {
        question: 'پرداخت، عضویت را بلافاصله فعال می‌کند؟',
        answer: 'عضویت پس از تأیید پرداخت روی سرور فعال می‌شود، نه با بازگشت مرورگر از درگاه.',
      },
    ],
    cta: { href: '/membership', label: 'مشاهده عضویت' },
  },
  {
    slug: 'registration-sheet',
    titleFa: 'برگه ثبتی',
    summaryFa: 'سند ثبتی هر حیوان، پس از تأیید هویت، میکروچیپ و نمونه‌گیری نزد دامپزشک معتمد.',
    definitionFa:
      'برگه ثبتی سند پایه هر حیوان در همزیست است. مشخصات حیوان را دامپزشک معتمد تأیید می‌کند، میکروچیپ کاشته یا تأیید می‌شود و نمونه خون گرفته می‌شود؛ برگه پس از آن صادر می‌شود.',
    audienceFa: 'مالک حیوانی که می‌خواهد پرونده رسمی آن در همزیست ساخته شود.',
    prerequisitesFa: [LOCK_KYC_REQUIRED.nextPrerequisite, LOCK_MEMBERSHIP_REQUIRED.nextPrerequisite],
    stepsFa: [
      'ثبت حیوان در پنل خود.',
      'انتخاب دامپزشک معتمد و ثبت درخواست مراجعه.',
      'تأیید مشخصات، کاشت یا تأیید میکروچیپ و نمونه‌گیری نزد دامپزشک.',
      'پرداخت هزینه صدور و صدور خودکار برگه پس از تأیید پرداخت.',
    ],
    documentsFa: ['شناسه یا مدارک موجود حیوان، در صورت وجود'],
    feeSettingKey: 'fee.registration_sheet_toman',
    noticeSettingKey: 'guide_text.registration_sheet_notice',
    faq: [
      {
        question: 'میکروچیپ را باید دوباره بکارم؟',
        answer: 'خیر. میکروچیپ یک‌بار در طول زندگی حیوان کاشته می‌شود؛ اگر از قبل کاشته شده باشد، فقط تأیید می‌شود.',
      },
      {
        question: 'برگه ثبتی همان شجره‌نامه است؟',
        answer: 'خیر. برگه ثبتی سند پایه است و شجره‌نامه سند نسب، که پس از برگه ثبتی و با نتیجه آزمایش صادر می‌شود.',
      },
    ],
    cta: { href: '/registration', label: 'شروع برگه ثبتی' },
  },
  {
    slug: 'pedigree',
    titleFa: 'شجره‌نامه',
    summaryFa: 'سند نسب حیوان، بر پایه همان نمونه‌ای که برای برگه ثبتی گرفته شده است.',
    definitionFa:
      'شجره‌نامه نسب حیوان را ثبت می‌کند. صدور آن به دو چیز بستگی دارد: برگه ثبتی صادرشده همان حیوان و نتیجه نهایی آزمایش نسب؛ هر کدام دیرتر برسد، کار را کامل می‌کند.',
    audienceFa: 'مالک حیوانی که برگه ثبتی آن صادر شده و نسبش باید رسمی ثبت شود.',
    prerequisitesFa: [LOCK_REGISTRATION_SHEET_REQUIRED.nextPrerequisite],
    stepsFa: [
      'اطمینان از صدور برگه ثبتی حیوان.',
      'ثبت درخواست شجره‌نامه از پنل.',
      'پرداخت هزینه و تأیید آن روی سرور.',
      'صدور پس از رسیدن نتیجه نهایی آزمایش نسب.',
    ],
    documentsFa: ['برگه ثبتی صادرشده همان حیوان'],
    feeSettingKey: 'fee.pedigree_toman',
    faq: [
      {
        question: 'پرداخت، شجره‌نامه را صادر می‌کند؟',
        answer: 'پرداخت تأییدشده یک نیمه کار است؛ نیمه دیگر نتیجه نهایی آزمایش نسب است و سند پس از هر دو صادر می‌شود.',
      },
      {
        question: 'اگر نتیجه آزمایش نسب را نپذیرم چه؟',
        answer: 'اعتراض به نتیجه در پنل شما ثبت می‌شود و پرونده دوباره بررسی می‌شود.',
      },
    ],
    cta: { href: '/pedigree', label: 'شروع شجره‌نامه' },
  },
  {
    slug: 'kennel',
    titleFa: 'ثبت کنل',
    summaryFa: 'ثبت کنل برای پرورش‌دهنده، با بررسی انجمن.',
    definitionFa:
      'کنل پرونده پرورش‌دهنده است. ثبت آن با پرداخت آغاز می‌شود، ولی پرداخت به‌تنهایی کنل را تأیید نمی‌کند: بررسی انجمن تصمیم می‌گیرد و نتیجه با دلیل ثبت می‌شود.',
    audienceFa: 'کسی که حیوان دارای برگه ثبتی دارد و می‌خواهد به‌عنوان پرورش‌دهنده فعالیت کند.',
    prerequisitesFa: [LOCK_MEMBERSHIP_REQUIRED.nextPrerequisite, LOCK_KENNEL_NEEDS_SHEET.nextPrerequisite],
    stepsFa: [
      'انتخاب نام کنل و ثبت درخواست.',
      'پرداخت هزینه ثبت و تأیید آن روی سرور.',
      'ارسال پرونده برای بررسی انجمن.',
      'ثبت نتیجه بررسی با دلیل، و فعال‌شدن نقش پرورش‌دهنده در صورت تأیید.',
    ],
    documentsFa: ['برگه ثبتی دست‌کم یک حیوان'],
    feeSettingKey: 'fee.kennel_registration_toman',
    faq: [
      {
        question: 'پرداخت یعنی کنل تأیید شده است؟',
        answer: 'خیر. پرداخت تأییدشده فقط مرحله ارسال پرونده را باز می‌کند؛ تصمیم با بررسی انجمن است.',
      },
    ],
    cta: { href: '/kennels', label: 'شروع ثبت کنل' },
  },
  {
    slug: 'mating-permit',
    titleFa: 'مجوز جفت‌گیری',
    summaryFa: 'مجوز جفت‌گیری دو حیوان شجره‌دار، با بررسی عملیاتی انجمن.',
    definitionFa:
      'مجوز جفت‌گیری برای دو حیوان شجره‌دار صادر می‌شود. قاعده‌های فاصله زمانی هر جنس از داده مدیریت‌شده خوانده می‌شود و در همین مسیر بررسی می‌شود.',
    audienceFa: 'مالک یا پرورش‌دهنده‌ای که هر دو حیوان شجره‌دارند.',
    prerequisitesFa: [LOCK_PERMIT_NEEDS_PEDIGREE.nextPrerequisite],
    stepsFa: [
      'انتخاب دو حیوان شجره‌دار و ثبت درخواست.',
      'بررسی شرایط و فاصله‌های ثبت‌شده هر حیوان.',
      'پرداخت هزینه و تأیید آن روی سرور.',
      'ثبت تصمیم بررسی عملیاتی انجمن.',
    ],
    documentsFa: ['شجره‌نامه هر دو حیوان'],
    feeSettingKey: 'fee.mating_permit_toman',
    faq: [
      {
        question: 'پرداخت، مجوز را صادر می‌کند؟',
        answer: 'خیر. پرداخت تأییدشده فقط ثبت نهایی را باز می‌کند و تصمیم با بررسی عملیاتی انجمن است.',
      },
    ],
    cta: { href: '/mating/permits', label: 'مجوز جفت‌گیری' },
  },
  {
    slug: 'puppy-card',
    titleFa: 'کارت توله',
    summaryFa: 'کارت هر توله زنده، پس از مجوز جفت‌گیری و ثبت زایمان.',
    definitionFa:
      'کارت توله برای توله‌های زنده یک زایمان ثبت‌شده صادر می‌شود. هر توله جداگانه بررسی و صادر می‌شود، پس یک توله ناواجد شرایط جلوی بقیه را نمی‌گیرد.',
    audienceFa: 'پرورش‌دهنده‌ای که مجوز جفت‌گیری گرفته و زایمان را ثبت کرده است.',
    prerequisitesFa: [LOCK_PUPPY_CARD_NEEDS_PERMIT.nextPrerequisite],
    stepsFa: [
      'ثبت نتیجه زایمان و توله‌های زنده.',
      'انتخاب توله‌ها و ثبت درخواست کارت.',
      'پرداخت هزینه و تأیید آن روی سرور.',
      'صدور کارت هر توله به‌صورت جداگانه.',
    ],
    documentsFa: ['مجوز جفت‌گیری صادرشده'],
    feeSettingKey: 'fee.puppy_card_toman',
    faq: [
      {
        question: 'اگر یکی از توله‌ها شرایط را نداشته باشد چه می‌شود؟',
        answer: 'همان توله با دلیلش ثبت می‌شود و کارت بقیه توله‌ها صادر می‌شود.',
      },
    ],
    cta: { href: '/mating', label: 'پرونده جفت‌گیری و توله‌ها' },
  },
  {
    slug: 'vet-visit',
    titleFa: 'مراجعه به دامپزشک معتمد',
    summaryFa: 'ثبت درخواست مراجعه برای تأیید مشخصات، میکروچیپ و نمونه‌گیری.',
    definitionFa:
      'برای برگه ثبتی، مشخصات حیوان باید نزد دامپزشک معتمد تأیید شود و نمونه خون گرفته شود. درخواست مراجعه در همزیست ثبت می‌شود؛ نوبت‌دهی و زمان مراجعه بیرون از همزیست و با خود دامپزشک است.',
    audienceFa: 'مالکی که حیوانش را ثبت کرده و مرحله تأیید و نمونه‌گیری را می‌خواهد شروع کند.',
    prerequisitesFa: [LOCK_KYC_REQUIRED.nextPrerequisite],
    stepsFa: [
      'ثبت حیوان در پنل.',
      'انتخاب دامپزشک معتمد و ثبت درخواست مراجعه.',
      'مراجعه، تأیید مشخصات و کاشت یا تأیید میکروچیپ.',
      'نمونه‌گیری و ارسال نمونه به مرکز ژنتیک.',
    ],
    documentsFa: ['مدارک هویتی مالک، پیش‌تر تأییدشده'],
    // The visit itself is not charged by Hamzist; the approved notice says so.
    feeSettingKey: null,
    noticeSettingKey: 'guide_text.vet_pricing_notice',
    faq: [
      {
        question: 'همزیست برای من نوبت می‌گیرد؟',
        answer: 'خیر. همزیست نوبت نمی‌دهد و زمان مراجعه را تضمین نمی‌کند؛ فقط درخواست شما را ثبت می‌کند.',
      },
      {
        question: 'هزینه ویزیت چقدر است؟',
        answer: 'هزینه ویزیت را خود دامپزشک یا مرکز تعیین می‌کند و در همزیست ثبت نمی‌شود.',
      },
    ],
    cta: { href: '/requests', label: 'ثبت درخواست مراجعه' },
  },
];

export const serviceBySlug = (slug: string): ServiceDefinition | null =>
  SERVICE_CATALOGUE.find((service) => service.slug === slug) ?? null;

export const servicePath = (slug: string): string => '/services/' + slug;

/** Every address this section publishes, for the sitemap (§19). */
export const servicePaths = (): string[] => ['/services', ...SERVICE_CATALOGUE.map((service) => servicePath(service.slug))];
