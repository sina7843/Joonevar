# محتوا — Numbers, money, dates, identifiers, voice

All formats come from the code, without exception.

| Kind | Format | Example | Code |
|---|---|---|---|
| Number | Persian digits, Persian thousands separator (٬ U+066C) | ۱۲٬۴۵۰ | `toLocaleString('fa-IR')` |
| Money | Integer **Toman** + «تومان» | ۴۵٬۰۰۰٬۰۰۰ تومان | `priceToman` (bigint) |
| Money not set | «تعیین‌نشده» — **never ۰**, and that payment path stays closed | تعیین‌نشده | 26 fees ship `null` |
| Date | Jalali, Persian digits | ۱۴۰۵/۰۷/۱۰ · ۱۰ مهر ۱۴۰۵ | `Intl` `fa-IR-u-ca-persian`, `Asia/Tehran` |
| Approximate date | prefix «حدود» | حدود ۱۴۰۲/۰۱ | `birthDateApproximate` |
| Identifier | **Latin**, in `<bdi dir="ltr">`, `id` type style | PET-8JDUN4GH | alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` |
| Microchip | 15 Latin digits, LTR | 364416562459223 | |
| Mobile | Latin, LTR | 09990000001 | samples use reserved `0999` |
| Empty field | «—» or a helper sentence — never blank space | — | |

Never show Rial in the interface. Never invent a number in a design: counts, prices and stats come from data.

## Identifier prefixes

| Prefix | Entity | Length |
|---|---|---|
| `PET-` | Animal | 8 |
| `RS-` | Registration sheet | 8 |
| `PD-` | Pedigree | 8 |
| `MP-` | Mating permit | 8 |
| `PC-` | Puppy card | 8 |
| `PUP-` | Puppy | 8 |
| `SM-` | Genetic sample | 10 |
| `HZ-` | Request | 10 |
| `HZP-` | Payment | base64url 16 |
| `HZR-` | Receipt | 12 |

`Identifier` must show the longest (`HZP-` + 16) on one line at 360px, with an optional copy button.

## Voice

- Precise, frank, unceremonious; say exactly what is wrong and what to do.
- «شما», no exclamation marks, no emoji.
- Buttons are verbs: «ثبت حیوان», «پرداخت ۴۰۰٬۰۰۰ تومان», «بارگذاری دوباره».
- Errors name the cause and the fix: «این پرونده پس از باز کردن شما تغییر کرده است. صفحه را دوباره بار کنید و سپس تصمیم بگیرید.»
- Status labels come only from the *Status dictionary*.
- Separators in meta lines: never put «·» next to Persian digits — at 12–13px it reads as «۰». Separate numeric items with «،», with spacing (separate `.hz-meta__item`s) or with a vertical *Divider*.
- «تعیین‌نشده» vs «—»: «تعیین‌نشده» means the system or an admin has not decided a value yet (a fee, a setting, a price); «—» means there is no data for this record. Unset values sort last and are never formatted as ۰ (see *UnsetValue*).
