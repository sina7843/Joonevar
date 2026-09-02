# Architecture baseline — Hamzist

## Status
This is a constraints baseline, not a preselected stack. The product reference explicitly leaves framework/database/deployment to implementation. PROMPT-001 must inspect existing code; preserve it if suitable. In an empty repository Claude selects and records a lean, maintained stack, package manager, pinned versions, persistence/transaction strategy, test tools and runtime from actual environment evidence. The inventory sample's NestJS/MongoDB/SheetJS/Ant Design stack is not a Hamzist requirement.

Prefer one deployable modular application with clear domain ownership unless existing code justifies otherwise. Do not add infrastructure by habit. No microservices, scheduler, arbitrary workflow engine or new product role is implied.

## Domain boundaries
| Boundary | Responsibility |
|---|---|
| Identity | OTP/session, profile, KYC, private identity files, account-level roles |
| Membership & eligibility | lifetime membership, independent number, reason/next prerequisite/CTA |
| Animals & lineage | G0/G1+, foreign pedigree review, animal timeline, distinct identifiers |
| Vet operations | approved vets/complete locations, requests, per-animal referral/check-in |
| Microchip & samples | permanent uniqueness, mandatory sampling, custody, shipment, resampling |
| Documents & money | per-item issuance, immutable monetary snapshots, verified callbacks |
| Genetics | one centre, receipt review, sample validation, parentage results, appeals |
| Breeding | breeder activation, kennels, permit, dates, birth declarations, puppies, allocations |
| Personal declarations | isolated unpaid agreement-existence records; no contract contents |
| Operations | association, genetics and superadmin shells with scoped permissions |
| Shared services | DB settings, private files, notifications/resume, audit, adapters |

## Required data guarantees
- Transaction or equally safe atomic strategy for one-time referral consumption, chip-to-animal binding, payment verification and document issuance.
- Enforce chip global uniqueness and one chip per animal for life at persistence boundary, including historical/archived records. UI checks alone are insufficient.
- Optimistic version checks for dates, allocations and editable declarations; approvals refer to an exact version and exact participant.
- Batch root + immutable item-level amounts/status; document success independent per eligible item. Duplicate callback/parallel workers must not duplicate effects.
- Audit records actor/time/target/before-after or version. Private fields/file access are scoped; logs should not expose cards, receipts, OTPs or secrets.
- Preserve civil event dates separately from timestamps as needed. Claude decides the product-compatible six-calendar-month convention and records tests at month-end/leap boundaries. Do not substitute 180 days without justification from an existing approved policy.
- Database settings have validation, scopes, effective values and history. Snapshot referral expiry/price version at creation; later changes affect newly created objects under a documented compatible rule, not recorded history.
- Notification targets contain entity and request/step context with server reauthorization. Outbox/idempotency or a justified equivalent prevents lost/duplicate domain effects.
- Use ordinary schema migrations, test fixtures and a recoverable update path; no destructive replacement of existing data.

## Integration boundaries
OTP/SMS, identity verification if already used, payment gateway, maps, reader/barcode, private storage and document rendering need explicit adapters. Select actual providers from available code/contracts or documented choices. No invented endpoints or credentials. Distinguish LOCAL_TEST, SANDBOX_VERIFIED, LIVE_VERIFIED and NOT_CONFIGURED. A fake provider must never activate in production silently. Hardware failures retain manual entry; normal pedigree reuses existing sample.

## UI implementation
Inspect the supplied prototype and DS when available, preserve layout/brand, use IRANSansX assets only when legitimately available, record any temporary fallback. Primary E46A1D, radii 8/12/16/999 follow token semantics. RTL, accessible errors, long Persian text, LTR isolation for identifiers, responsive shells and deep links are shared contracts. Missing operational screens are composed in code; they are not permission to redesign Figma.

## Discovery deliverables
PROMPT-001 writes docs/architecture/implementation-plan.md, docs/architecture/data-contracts.md, docs/architecture/permissions.md, docs/discovery/reference-access.md, docs/discovery/integration-readiness.md and a route/flow coverage table. These are live technical documents; update with decisions as implementation teaches you more.
