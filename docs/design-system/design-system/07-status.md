# فرهنگ وضعیت — Status dictionary

Every status in the product maps to **one family**, and every family has **exactly one tone**. The tone says **who must act**, not how good or bad the outcome is. Use `StatusBadge` with the key; never write a status label by hand — today 435 label keys live in at least 39 files with inconsistent wording.

Who acts next is shown separately by `ActionOwner` («اقدام بعدی با: …»), never by changing the label: «در حال بررسی» + «اقدام بعدی با: مرکز ژنتیک», not «در حال بررسی مرکز ژنتیک».

A status is **colour + text** (+ dot). Never colour alone.

## Families and tones

| Family | Meaning | Tone | Tokens |
|---|---|---|---|
| `draft` | ناقص یا هنوز ارسال‌نشده | **neutral** | `status-neutral-bg` · `status-neutral-text` · `status-neutral-border` |
| `waiting` | منتظر دیگری — کاری از شما برنمی‌آید | **info** | `status-info-bg` · `status-info-text` · `status-info-border` |
| `action` | نیازمند اقدام شما | **warning** | `status-warning-bg` · `status-warning-text` · `status-warning-border` |
| `done` | کامل، معتبر یا فعال | **success** | `status-success-bg` · `status-success-text` · `status-success-border` |
| `blocked` | رد، ناموفق یا مسدود | **error** | `status-error-bg` · `status-error-text` · `status-error-border` |
| `closed` | پایان‌یافته بدون خطا | **neutral** | `status-neutral-bg` · `status-neutral-text` · `status-neutral-border` |

## The 7 approved tone changes (10 Mehr 1405)

These statuses change colour versus today's code because the family rule says so.

| Key | Label | Code tone | → New tone | Family | Reason |
|---|---|---|---|---|---|
| `PENDING_VERIFICATION` | در انتظار بررسی | warning | **info** | waiting | someone else must act |
| `AWAITING_PAYMENT` | در انتظار پرداخت | info | **warning** | action | the user must act |
| `READY` | آماده واریز | info | **success** | done | complete / ready |
| `SUPERSEDED` | جایگزین‌شده | info | **neutral** | closed | ended without error |
| `SOLD` | فروخته‌شده | info | **neutral** | closed | ended without error |
| `RESERVED` | رزروشده | info | **neutral** | closed | ended without error |
| `HIDDEN` | پنهان | warning | **neutral** | closed | ended without error |

## All 81 statuses


### draft — ناقص یا هنوز ارسال‌نشده · tone `neutral` · 4

| Key | Label (use this) | Variants in code today (retire) |
|---|---|---|
| `DRAFT` | پیش‌نویس | تکمیل مدارک، آماده پرداخت، برگرداندن به پیش‌نویس، تکمیل اطلاعات |
| `READY_TO_SUBMIT` | آماده ارسال | — |
| `INACTIVE` | غیرفعال | — |
| `NONE` | ثبت‌نشده | بدون عضویت، بدون دوره فعالیت |

### waiting — منتظر دیگری — کاری از شما برنمی‌آید · tone `info` · 25

| Key | Label (use this) | Variants in code today (retire) |
|---|---|---|
| `SUBMITTED` | در انتظار بررسی | ارسال‌شده برای بررسی، ثبت‌شده، ارسال‌شده |
| `UNDER_REVIEW` | در حال بررسی | در حال بررسی مرکز ژنتیک، در حال بررسی مرکز، در حال بررسی انجمن |
| `PENDING_REVIEW` | در انتظار بررسی انجمن | در انتظار تصمیم، در انتظار بررسی |
| `WAITING_REVIEW` | درخواست ارسال‌شده | در انتظار بررسی |
| `PENDING_VERIFICATION` ★ | در انتظار بررسی | — |
| `AWAITING_COUNTERPARTY` | در انتظار تأیید طرف مقابل | — |
| `PROCESSING` | در حال پردازش | در حال اجرا |
| `SCHEDULED` | زمان‌بندی‌شده | زمان و محل تعیین شد |
| `PREPARING` | در حال آماده‌سازی | — |
| `ACCEPTED_BY_SELLER` | پذیرفته‌شده | — |
| `SHIPPED` | ارسال‌شده | ارسال ثبت شد |
| `TECHNICAL_REVIEW` | در مرحله تأیید فنی | — |
| `WAITING_PARENT_RESULTS` | در انتظار تکمیل نتایج والدین | — |
| `NEGOTIATING` | در حال مذاکره | — |
| `CONTRACT_DRAFTING` | ورود به قرارداد | در حال تنظیم قرارداد |
| `PENDING` | در جریان | در انتظار تصمیم انجمن، در انتظار اجرا، صادرنشده |
| `OPEN` | در انتظار بررسی | باز، در انتظار پاسخ فروشنده، در حال بررسی |
| `PROPOSED` ＋ | در انتظار پاسخ | پیشنهاد فعلی |
| `CODE_ISSUED` ＋ | کد تحویل صادر شد | — |
| `FINDER_INVITE_ONLY` ＋ | فقط با دعوت | — |
| `FINDER_UNAVAILABLE` ＋ | موقتاً در دسترس نیست | TEMPORARILY_UNAVAILABLE (finder) |
| `COLLECTED` ＋ | نمونه‌گیری انجام شد | — |
| `SEND_INSTRUCTED` ＋ | دستور ارسال صادر شد | دستور ارسال از مرکز ژنتیک |
| `SAMPLE_RECEIVED` ＋ | دریافت‌شده در مرکز | RECEIVED (genetics) |
| `RESAMPLED` ＋ | نمونه‌گیری مجدد در همین درخواست | — |

### action — نیازمند اقدام شما · tone `warning` · 8

| Key | Label (use this) | Variants in code today (retire) |
|---|---|---|
| `NEEDS_CORRECTION` | نیازمند اصلاح | Export Pedigree شما نیازمند اصلاح است، احراز هویت شما نیازمند اصلاح است |
| `AWAITING_PAYMENT` ★ | در انتظار پرداخت | در انتظار پرداخت صدور |
| `PENDING_PAYMENT` | در انتظار پرداخت | — |
| `EXPIRED` | منقضی | منقضی‌شده، مهلت کد تحویل گذشت، مهلت پرداخت گذشت |
| `PAUSED` | موقتاً متوقف | متوقف‌شده توسط فروشنده، توقف موقت آگهی |
| `RETURN_REQUESTED` | درخواست مرجوعی | — |
| `TEMPORARILY_UNAVAILABLE` | موقتاً غیرفعال | — |
| `MARKED_UNUSABLE` ＋ | نمونه غیرقابل‌استفاده ثبت شد | — |

### done — کامل، معتبر یا فعال · tone `success` · 20

| Key | Label (use this) | Variants in code today (retire) |
|---|---|---|
| `APPROVED` | تأییدشده | تأیید شده، Export Pedigree شما تأیید شد، پذیرفته‌شده — در انتظار ارسال به فروشگاه، تأییدشده، در انتظار فعال‌سازی |
| `ACTIVE` | فعال | عضو فعال، فعال و تأییدشده، در حال فروش، در انتظار مراجعه |
| `PUBLISHED` | منتشرشده | انتشار، انتشار آگهی |
| `ISSUED` | صادر شد | مجوز صادر شد، صادرشده |
| `PAID` | پرداخت‌شده | پرداخت تأییدشده، واریزشده — در انتظار مغایرت‌گیری، در انتظار پذیرش فروشنده، پرداخت شد |
| `VERIFIED` | تأییدشده | — |
| `COMPLETED` | تحویل انجام و مالکیت منتقل شد | انجام‌شده |
| `DELIVERED` | تحویل‌شده | — |
| `FINAL` | نتیجه نهایی | نهایی‌شده با تأیید دوطرفه |
| `VALID` | معتبر | — |
| `REGISTERED` | — (no badge: shown via the record id, e.g. PET-) | — |
| `CONFIRMED` | وجود توافق تأیید شد | تأییدشده دوطرفه |
| `READY` ★ | آماده واریز | آماده ارسال |
| `RESOLVED` | تعیین تکلیف شد | — |
| `ALIVE` | زنده | — |
| `ACCEPTED` ＋ | پذیرفته‌شده | پیشنهاد پذیرفته شد |
| `IN_STOCK` ＋ | موجود | — |
| `LOW_STOCK` ＋ | فقط {n} عدد موجود | — |
| `FINDER_READY` ＋ | آماده دریافت درخواست | READY (finder) |
| `OVERTURNED` ＋ | اعتراض پذیرفته شد | — |

### blocked — رد، ناموفق یا مسدود · tone `error` · 8

| Key | Label (use this) | Variants in code today (retire) |
|---|---|---|
| `REJECTED` | ردشده | رد شده، Export Pedigree شما رد شد، طرف مقابل وجود توافق را رد کرد، احراز هویت شما رد شد |
| `FAILED` | ناموفق | پرداخت ناموفق، واریز ناموفق، اجرا ناموفق بود |
| `SUSPENDED` | تعلیق‌شده | معلق، متوقف‌شده توسط ناظر |
| `REVOKED` | باطل‌شده | لغوشده |
| `DISPUTED` | در حال بررسی اختلاف | — |
| `DELETED` | حذف‌شده | حذف (قابل بازگردانی) |
| `TERMINATED` | خاتمه‌یافته | — |
| `PAYMENT_FAILED` | پرداخت ناموفق | — |

### closed — پایان‌یافته بدون خطا · tone `neutral` · 16

| Key | Label (use this) | Variants in code today (retire) |
|---|---|---|
| `CANCELLED` | لغوشده | پرداخت لغوشده، پس‌گرفته‌شده، لغوشده توسط آغازکننده، لغو شد |
| `WITHDRAWN` | پس گرفته شد | پس‌گرفته‌شده، توسط خریدار پس گرفته شد، حذف‌شده با اصلاح گزارش اولیه، بایگانی‌شده با انصراف |
| `ARCHIVED` | بایگانی‌شده | بایگانی، بایگانی؛ نشانی باز است |
| `REMOVED` | برداشته‌شده | حذف‌شده، حذف آگهی |
| `SUPERSEDED` ★ | جایگزین‌شده | جایگزین‌شده با نسخه جدید، با پیشنهاد تازه جایگزین شد، جایگزین‌شده با خرید تازه‌تر |
| `SOLD` ★ | فروخته‌شده | — |
| `RESERVED` ★ | رزروشده | — |
| `REFUNDED` | بازپرداخت‌شده | — |
| `RETURNED` | مرجوع‌شده | — |
| `HIDDEN` ★ | پنهان | پنهان‌شده توسط ادمین محتوا، پنهان‌کردن |
| `DECEASED` | فوت | فوت‌شده، فوت‌شده پس از تولد |
| `MERGED` | ادغام‌شده در محصول پایه | — |
| `LEFT` | خارج‌شده | — |
| `DECLINED` ＋ | پذیرفته نشد | پیشنهاد رد شد |
| `CLOSED` ＋ | بسته‌شده | گفتگو بسته شد |
| `OUT_OF_STOCK` ＋ | ناموجود | — |

★ = tone changed versus code (approved). ＋ = added on 11 Mehr 1405, approved by the product owner.

## Scoped sets (approved 11 Mehr 1405)

Some screens may show only a subset of the dictionary. Use these keys, not new labels.

| Where | Keys, in lifecycle order | Notes |
|---|---|---|
| Shop sub-order (`SubOrderCard`) | `PENDING_PAYMENT` → `PAID` → `ACCEPTED_BY_SELLER` → `PREPARING` → `SHIPPED` → `DELIVERED`; side exits `REJECTED`, `CANCELLED`, `RETURN_REQUESTED` → `RETURNED` → `REFUNDED` | All 11 were already in the dictionary; this fixes the set. |
| Product stock (`StockBadge`) | `IN_STOCK`, `LOW_STOCK`, `OUT_OF_STOCK`, `RESERVED` | `available = stockOnHand − stockReserved`. Low = available ≤ the `shop.lowStockThreshold` setting (default 5, approved 11 Mehr 1405). Reserved can never exceed stock on hand: the server refuses the reservation, so there is no "short" state. |
| Price offer (`OfferCard`) | `PROPOSED` → `ACCEPTED` / `DECLINED` / `EXPIRED` / `WITHDRAWN` / `SUPERSEDED` | Offers are open on every listing; there is no fixed-price mode. |
| Delivery code (`DeliveryCodeCard`) | `CODE_ISSUED` → `COMPLETED` / `EXPIRED` | |
| Conversation (`ConversationList`, thread) | open (no badge) → `CLOSED` | A thread closed because the listing sold or was reserved shows `SOLD` / `RESERVED` instead. |
| Mating-finder availability (`MatingProfileCard`) | `FINDER_READY`, `FINDER_INVITE_ONLY`, `FINDER_UNAVAILABLE` | Separate keys from payout `READY` «آماده واریز» and the general `TEMPORARILY_UNAVAILABLE`, so one key never has two meanings. Shown as the card's availability line (icon + label), not as a pill. |
| Genetics sample (`CaseQueue` on `/genetics/samples`) | `COLLECTED` → `SEND_INSTRUCTED` → `SAMPLE_RECEIVED` → `PROCESSING` → `TECHNICAL_REVIEW` → `FINAL`; side states `WAITING_PARENT_RESULTS`, `MARKED_UNUSABLE` → `RESAMPLED`; appeals `OVERTURNED` / `REJECTED` | Labels are the code's own. `SAMPLE_RECEIVED` is separate from the shop's `RECEIVED` «دریافت‌شده در فروشگاه». Sample **kinds** are tags, not statuses: `BLOOD_SAMPLE` «نمونه‌گیری خون», `DNA` «نمونه‌گیری DNA», `DNA_RESAMPLING` «نمونه‌گیری مجدد DNA» (`CategoryTag --neutral`). |
| Payment (gateway) | `PENDING` «در جریان» → `PAID` / `FAILED` / `CANCELLED` | Waiting for the user to pay is `PENDING_PAYMENT`, not `PENDING`. |

## One look for every viewer

A key has **one label and one tone for everyone**; the badge never changes with the person looking at it. The family describes the case's general state («منتظر دیگری» = the case waits on a step outside the requester). **Who must act is always `ActionOwner`**, which *is* per viewer: an operator can see `WAITING_PARENT_RESULTS` (info) together with «اقدام بعدی با: شما» when the missing parent result is the centre's own work. Never recolour a badge to say "it is your turn" — that is ActionOwner's job.

## Trust mark (not a status)

| Key | Label | Look | Rule |
|---|---|---|---|
| `TRUSTED` | معتمد | success tone + `shield-check` icon, `hz-badge--success` | Shown on vets, shops and kennels the association marks as trusted. It never changes and has no opposite: untrusted records show nothing (never «غیرمعتمد»). |

**Badge anatomy:** pill (`radius-full`), height 24px, padding 0 12px, 8px dot in `status-{tone}-border`, label in `overline`/12px 600 in `status-{tone}-text` on `status-{tone}-bg` with a 1px `status-{tone}-border` outline. Two sizes at checkpoint 3 (24 / 20).