# Key screens K1–K19 — exported images

Exported on 11 Mehr 1405 (3 Oct 2026) from the key-screens canvas, design system **v1.0.3**. These are the visual reference for close fidelity (DEC-0259): same structure, order, components, density and states. Desktop images are 1440 px wide at 1×; phone images are 390 px wide at 2× (780 px files) so small text stays readable.

| Screen | Route · role | Shell · pattern | Hard case shown | Files |
|---|---|---|---|---|
| K1 خانه | `/` · visitor | SiteShell · P01 | announcement without image and long title; service with unset fee | `K01-home-1440.png`, `K01-home-390.png` |
| K2 داشبورد کاربر | `/dashboard` · user | PublicShell · P04 | active user, brand-new user (all empty), user with an operator role | `K02-dashboard-1440.png`, `K02-dashboard-390.png`, `K02-dashboard-new-user-390.png`, `K02-dashboard-ops-role-1440.png` |
| K3 میز تصمیم KYC | `/assoc/kyc/[id]` · association operator | OpsShell · P10 | stale decision, 12-day case, private documents | `K03-kyc-desk-1440.png`, `K03-kyc-desk-390.png` |
| K4 مقاله | `/articles/[slug]` · visitor | SiteShell · P03 | related item without image, long title | `K04-article-1440.png`, `K04-article-390.png` |
| K5 فهرست دامپزشکان | `/veterinarians` · visitor | SiteShell · P02 | vet without photo, three-line centre name | `K05-vets-1440.png`, `K05-vets-390.png` |
| K6 آگهی حیوان | `/animals-market/[id]` · visitor | SiteShell · P03 | similar listing without image, unset price | `K06-listing-1440.png`, `K06-listing-390.png` |
| K7 محصول فروشگاه | `/shop/[slug]` · visitor | SiteShell · P03 | variant out of stock, long product name | `K07-product-1440.png`, `K07-product-390.png` |
| K8 ورود | `/login` · visitor | SiteShell (minimal) | wrong code, resend countdown | `K08-login-1440.png`, `K08-login-390.png` |
| K9 پرونده حیوان | `/animals/[id]` · user | PublicShell · P06 | parents not registered, unset fee | `K09-animal-1440.png`, `K09-animal-390.png` |
| K10 ثبت حیوان، مرحله ۲ از ۶ | `/animals/new` · user | PublicShell · P07 | name validation error | `K10-animal-new-1440.png`, `K10-animal-new-390.png` |
| K11 پیگیری درخواست | `/requests/[id]` · user | PublicShell · P06 | needs correction, deadline passed | `K11-request-1440.png`, `K11-request-390.png` |
| K12 پذیرش دامپزشک | `/vet/check-in` · trusted vet | PublicShell (vet) | chip not registered | `K12-vet-checkin-1440.png`, `K12-vet-checkin-390.png` |
| K13 خانه پنل انجمن | `/assoc` · association operator | OpsShell · P09 | empty queue and overdue queue | `K13-assoc-home-1440.png`, `K13-assoc-home-390.png` |
| K14 صف آگهی‌ها | `/market/listings` · listing moderator | OpsShell · P09 | unset price, bulk action | `K14-market-listings-1440.png`, `K14-market-listings-390.png` |
| K15 تنظیمات | `/admin/settings` · superadmin | OpsShell · P11 | 26 unset keys, versioned edit with reason | `K15-settings-1440.png`, `K15-settings-390.png`, `K15-settings-edit-390.png` |
| K16 گزارش تخلف محتوا | `/content/reports/[id]` · content admin | OpsShell · P10 | many reports, reporter privacy | `K16-content-report-1440.png`, `K16-content-report-390.png` |
| K17 گفتگوی آگهی | `/account/listings/[id]/requests` · seller | PublicShell · P12 | unsent message, closed conversation | `K17-listing-chat-1440.png`, `K17-listing-chat-390.png` |
| K18 سند شجره‌نامه (چاپی) | `/documents/pedigree/[id]` | A4 document | unknown ancestor | `K18-pedigree-doc-1440.png`, `K18-pedigree-doc-390.png` |
| K19 صف نمونه‌های ژنتیک | `/genetics/samples` · genetics operator | OpsShell · P09 | final test screen (overdue, unusable sample, bulk receipt) | `K19-genetics-samples-1440.png`, `K19-genetics-samples-390.png` |

Brand boards: `B01-logo-system.png` (logo system), `B02-app-icon.png` (app icon options — **A** chosen — and favicon).

If an image and a README rule ever disagree, the newer `CHANGELOG.md` entry wins; the live canvas is the source these images were taken from.
