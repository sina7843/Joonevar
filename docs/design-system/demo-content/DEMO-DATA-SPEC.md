# Demo data — what to seed so every designed screen is visible

**Goal:** after running the sample seed, signing in as each fixture role shows the pages populated the way the key screens K1–K19 show them, with all 78 approved photos in use.
**Where:** extend the existing design-system sample seed `src/db/seed/sample-content.ts` (DEC-0269) — one seed for all areas, through the product's services.
**Guard:** never in production (`APP_ENV=production` → refuse). Idempotent. `--reset` deletes demo rows only.
**Sources:** `../sample-content/*.json` (corrected) + `images-manifest.json`. Where the source is thin, create more rows **in the same style** (real Persian names and cities, Toman amounts, Jalali-consistent dates near 10 Mehr 1405, ids in the `_meta.json` formats). Keep national IDs as given (presentation data). Only rows the existing schema and state machines accept — no new behaviour.
**Photos:** import each file through `putPrivateFile` / `storedFiles` (it checks the mime), set `imageFileId` + `imageAltFa` from the manifest.

## Accounts and people

| What | Rows | Notes |
|---|---|---|
| Fixture accounts (`0999…`) | the existing `FIXTURE_ACCOUNTS` | Give each its avatar from `people/*` and its profile from `people.json` (owner, breeder, vet, association, genetics, admin, author…). |
| Extra people | the rest of `people.json` (10 in total) | Counterparts for chats, members, applicants in queues. |

## User area (PublicShell) — K2, K9, K10, K11, P04–P08

| What | Rows | Shows on |
|---|---|---|
| Animals | 8 from `animals.json` with photos (`animals/*`), incl. 1 draft (مکس, step 3/6) and 1 cat without breed | dashboard, «حیوان‌های من», animal file K9, wizard K10 draft |
| Documents | 6 registration sheets, 3 pedigrees (رکس, لونا, آرا), 2 mating permits (1 issued, 1 waiting for counterparty), 1 litter, 1 puppy card | animal file, `/documents`, verify, K18 |
| Requests | 5 from `requests-and-payments.json` (pedigree for **تارا** awaiting payment, KYC, mating permit, kennel needs-correction, parentage test) | dashboard, `/requests`, K11 |
| Payments | 4 (paid, failed, pending, cancelled) | `/payments`, payment return pages |
| Membership | association membership (active, lifetime) | dashboard |
| Notifications | 6 from `notifications.json` (2 unread) | bell, `/notifications` |
| Vet referral code | 1 (`referralCodes`) | K11, vet check-in |

## Public site (SiteShell) — K1, K4, K5, K6, K7, P01–P03

| What | Rows | Photos |
|---|---|---|
| Breeds | 10 from `taxonomy.json` with traits for at least ژرمن شپرد and سگ سرابی | `breeds/*` (10) |
| Content | 14 from `content.json`: 6 articles, 4 news, announcements, 1 club post; categories; one long-title edge case | `content/*` (11); announcements without image (designed) |
| Vets | 6 from `directory.json` (4 trusted, 1 student, 1 with long clinic name) | `vets/*` (6) |
| Centres | 5 (1 expired licence → hidden from public results, visible in its panel) | `centres/*` (5) |
| Associations & clubs | 5 communities + next events | `communities/*` (5) |
| Kennels | 2 | — (symbol empty state) |
| Animal market | 6 listings (2 photos each; 1 reserved, 1 sold, offers on), the K17 inquiry with offer and handover appointment | `listings/*` (12) |
| Shop | 2 sellers (shipping 85,000 / 95,000; thresholds), 8 products with SKUs and stock (incl. low stock, reserved, out of stock), reviews, questions, a cart from two shops, 2 orders with sub-orders | `products/*` (8) |
| Mating finder | 3 profiles (ready, invite only, unavailable) + 1 request in negotiation | animal photos |
| Home | hero images, «تازه‌ها», featured breed (سگ سرابی, with traits), 5 breed tiles, 4 listings + 4 products, 4 trusted vets + 3 centres, 4 clubs with covers, counts + 3 steps, CtaBand photo (v1.0.4) | `home/*` + `sample-hero-dog.jpg` + the photos marked «home» in the manifest |

## Vet (PublicShell vet tabs) — K12

Today's queue: 3 visits (one checked in), the K12 «last read» chip (تارا) and «previous read» not-found case, one sample to send.

## Operations (OpsShell) — K3, K13–K16, K19, P09–P11

| Environment | Rows |
|---|---|
| Association | KYC queue: 4 cases (1 overdue 12 days, 1 resubmitted v3 — علی رضایی as in K3), membership 6, vet review 3, kennel 1, mating permits 2 |
| Genetics | samples queue as K19: 6 samples (تارا overdue, بلا marked unusable, رکس technical review, نیکا waiting parent results, لونا processing, رعد send-instructed), receipts 3, results 2, appeals 1 |
| Market | listings queue as K14 (published, expired, reserved, sold), reports with reasons and counts, 1 dispute |
| Content | 3 reports incl. the K16 case (report reasons, keep · hide · remove) |
| Admin | settings with 7 configured fees and the rest «تعیین‌نشده» (`fees.json`), roles, merge candidates (1 breed duplicate) |
| Author | 2 drafts, 1 in review |

## Edge cases (must appear somewhere)

Everything in `edge-cases.json`: the 3-line centre name, the long puppy name «شاهزاده کوچولوی باغ ارم شیراز», unnamed animal «بدون نام», missing images, unset fee, empty lists (one role with nothing yet), long notification text, overdue case.

## Check when done

- Each route group signed in as its role at 390 and 1440 → no page shows an empty state unless that state is the point.
- `images-manifest.json`: 78/78 files referenced by a record (log the count).
- `npm run check` passes; the demo seed is covered by one test (idempotent + reset).
