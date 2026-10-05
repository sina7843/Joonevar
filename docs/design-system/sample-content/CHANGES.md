# sample-content — corrections (11 Mehr 1405)

Drop-in replacements for the pack's `sample-content/` folder. Only these 6 files changed; the rest are copied unchanged.

| File | Change | Decision |
|---|---|---|
| requests-and-payments.json | HZ-49UQ9KAEBE «صدور شجره‌نامه» is now for **تارا** (was لونا, who already has PD-475VU8E2) | One pedigree per animal |
| notifications.json | Payment reminder names «تارا» | same |
| finder.json | `state` keys → `FINDER_READY`, `FINDER_INVITE_ONLY`, `FINDER_UNAVAILABLE`; رعد breed → روتوایلر (as in animals.json) | Separate finder keys; registry wins |
| marketplace.json | `priceMode` EXACT → NEGOTIABLE («قابل مذاکره») on all 3 listings | Fixed price removed; offers on every listing |
| shop.json | SKU-GZ29X4 `stockOnHand` 0 → 2 (reserved 2); `cart.shippingBySeller` added (آریا ۸۵٬۰۰۰ + نمونه رایگان = ۸۵٬۰۰۰) and `cart.shippingRule` | Reserved ≤ stock; shipping = sum per shop |
| status-dictionary.json | 17 statuses added (`addedOn: 1405-07-11`), `trustMark` TRUSTED «معتمد», `sampleKinds`; «آماده دریافت درخواست» removed from READY's variants | Dictionary additions (offer, delivery code, chat, stock, finder, genetics sample) |

Not changed on purpose: national IDs in people.json (presentation data; real IDs come later).
