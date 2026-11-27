# Design system audit — v1.0.4

App: `D:\CLaude\Hamzist-Prompt-Driven-Project-v1.0-20-prompts` · package: `docs/design-system` · 2026-11-26T22:08:29.322Z

**FAIL 0 · REVIEW 4 · OK 9**

## REVIEW · Status

Module-level status label maps still in use (GAPS #4): map each to a dictionary key.

- app/(public)/clubs/[slug]/join/page.tsx
- app/account/clubs/[id]/page.tsx
- app/account/listings/[id]/page.tsx
- app/account/mating-finder/requests/page.tsx
- app/account/mating-finder/requests/[id]/page.tsx
- app/account/orders/[id]/page.tsx
- app/account/purchases/[id]/page.tsx
- app/account/seller/finance/page.tsx
- app/admin/centres/[id]/page.tsx
- app/admin/communities/[id]/page.tsx
- app/admin/vets/page.tsx
- app/animals/[id]/page.tsx
- app/assoc/foreign-pedigree/[id]/page.tsx
- app/assoc/kennels/[id]/page.tsx
- app/content/reports/page.tsx
- app/content/reports/[contentId]/page.tsx
- app/dashboard/page.tsx
- app/documents/puppy-card/[id]/page.tsx
- app/genetics/appeals/page.tsx
- app/genetics/appeals/[id]/page.tsx
- app/genetics/receipts/[id]/page.tsx
- app/genetics/samples/page.tsx
- app/litters/[id]/allocation/page.tsx
- app/market/finder/feedback/page.tsx
- app/market/handovers/page.tsx
- app/market/refunds/page.tsx
- app/market/returns/page.tsx
- app/market/settlement/page.tsx
- app/market/settlement-actions.ts
- app/mating/date-history.tsx
- app/mating/permits/[id]/birth/page.tsx
- app/mating/permits/[id]/dates/page.tsx
- app/mating/permits/[id]/pregnancy/page.tsx
- app/membership/page.tsx
- app/pedigree/appeals/[id]/page.tsx
- app/pedigree/receipts/[id]/page.tsx
- app/pedigree/[animalId]/page.tsx
- app/requests/status-badges.tsx
- app/requests/[id]/page.tsx
- app/review/centres/(list)/page.tsx
- app/vet/requests/[id]/page.tsx
- app/vet/sample-status-badge.tsx
- src/animals/foreign-pedigree.ts
- src/billing/membership-model.ts
- src/billing/membership.ts
- src/billing/receipts.ts
- src/centres/editor.tsx
- src/centres/forms.tsx
- src/centres/model.ts
- src/clubs/actions.ts
- src/clubs/membership-model.ts
- src/clubs/model.ts
- src/clubs/rules-forms.tsx
- src/clubs/rules-model.ts
- src/commerce/catalog-model.ts
- src/commerce/finance-forms.tsx
- src/commerce/fulfilment-model.ts
- src/commerce/order-forms.tsx
- src/commerce/order-model.ts
- src/commerce/orders.ts
- src/commerce/seller-model.ts
- src/commerce/sellers.ts
- src/communities/forms.tsx
- src/communities/model.ts
- src/domain/declaration-copy.ts
- src/domain/microchip.ts
- src/domain/referral.ts
- src/finder/downstream.ts
- src/finder/profile-model.ts
- src/finder/request-model.ts
- src/genetics/appeals.ts
- src/genetics/service.ts
- src/identity/kyc.ts
- src/kennels/service.ts
- src/marketplace/cancellation-model.ts
- src/marketplace/handover-model.ts
- src/marketplace/inquiry-model.ts
- src/marketplace/listing-model.ts
- src/marketplace/moderation-model.ts
- src/mating/allocation.ts
- src/mating/birth.ts
- src/mating/dates.ts
- src/mating/declaration.ts
- src/mating/permits.ts
- src/moderation/model.ts
- src/vets/directory-forms.tsx
- src/vets/directory-model.ts
- src/vets/doctor-application.ts
- src/vets/licence-application.ts
- src/vets/onboarding-forms.tsx
- src/vets/onboarding-model.ts
- src/vets/onboarding.ts
- src/vets/professional-profile-model.ts
- src/vets/professional-profile.ts
- src/vets/review-workbench.ts
- src/vets/student-application.ts
- src/vets/trusted-application.ts
- src/vets/trusted-period.ts

## REVIEW · Icons

Icons outside the approved 128 still used by screens (04-iconography: one meaning = one icon).

- listChecks
- calendarDots

## REVIEW · Components

101 of 129 components have classes (variants, parts, states) the app never renders. Implement each one the pages need, from its README + preview.html.

- A4DocumentTemplate (97% of its classes used) — unused: hz-a4__qr-box
- Accordion (83% of its classes used) — files named in its README not found: src/ui/accordion.tsx — unused: hz-accordion--sm hz-accordion__heading hz-accordion__icon hz-accordion__meta
- AccountMenu (85% of its classes used) — files named in its README not found: src/ui/account-menu.tsx — unused: hz-menu--up hz-menu__head hz-menu__head-name hz-menu__head-sub hz-menu__head-text hz-menu__hint
- ActionOwner (94% of its classes used) — unused: hz-age--overdue
- Alert (89% of its classes used) — unused: hz-alert--neutral hz-alert--success
- AuditRow (90% of its classes used) — files named in its README not found: src/ops/audit-row.tsx — unused: hz-audit-card__head hz-audit-card__label hz-audit-card__reason hz-audit-change--open hz-audit-change__clamp hz-audit-change__toggle hz-audit-target__name
- Avatar (31% of its classes used) — files named in its README not found: src/ui/avatar.tsx — unused: hz-avatar--empty hz-avatar--lg hz-avatar--logo hz-avatar--xl hz-avatar--xs hz-person hz-person__name hz-person__sub hz-person__text
- BottomSheet (98% of its classes used) — unused: hz-sheet__sub
- Breadcrumbs (88% of its classes used) — unused: hz-breadcrumbs__more hz-breadcrumbs__text
- BreedCard (96% of its classes used) — files named in its README not found: src/breeds/profile.tsx — unused: hz-breed-profile__title
- BulkActionBar (86% of its classes used) — files named in its README not found: src/ops/bulk-action-bar.tsx — unused: hz-age--late hz-bulkbar--bottom hz-bulkbar__all hz-bulkbar__row hz-cardlist__body hz-cardlist__item--select hz-cardlist__item--selected hz-queue__title
- CartRow (92% of its classes used) — files named in its README not found: src/shop/cart-row.tsx — unused: hz-cart-row__count hz-cart-row__qty hz-cart-row__remove
- CaseQueue (93% of its classes used) — files named in its README not found: src/ops/case-queue.tsx — unused: hz-age--late hz-age--overdue hz-input--sm hz-queue__sort hz-queue__title
- CategoryTag (94% of its classes used) — files named in its README not found: src/ui/category-tag.tsx — unused: hz-tag--inline
- CenterCard (93% of its classes used) — unused: hz-centre__facilities hz-centre__hours
- Checkbox (87% of its classes used) — unused: hz-check__desc hz-choice-group--nested
- Combobox (36% of its classes used) — files named in its README not found: src/ui/combobox.tsx — unused: hz-combobox hz-combobox__chip hz-combobox__chip-label hz-combobox__chip-remove hz-combobox__control hz-combobox__control--chips hz-combobox__end hz-combobox__input hz-listbox hz-listbox--multi hz-listbox__box hz-listbox__empty hz-listbox__meta hz-listbox__option hz-listbox__option--active hz-listbox__primary hz-listbox__status hz-listbox__text
- CompareTable (60% of its classes used) — files named in its README not found: src/shop/compare-table.tsx — unused: hz-compare hz-compare--diff hz-compare--swipe hz-compare__add hz-compare__bar hz-compare__brand hz-compare__cell hz-compare__label hz-compare__name hz-compare__nav hz-compare__nav-btns hz-compare__product hz-compare__rating hz-compare__remove hz-compare__row hz-compare__row--head hz-compare__row--same hz-compare__scroll hz-compare__table hz-compare__title hz-compare__tools
- ContentDetail (91% of its classes used) — unused: hz-content-detail--compact hz-figure__caption hz-figure__credit
- ContractCard (63% of its classes used) — unused: hz-contract hz-contract__confirm hz-contract__confirm-title hz-contract__head hz-contract__parties hz-contract__sub hz-contract__title hz-otp-field__resend hz-party hz-party--confirmed hz-party--you hz-party__animal hz-party__name hz-party__role hz-party__state
- ConversationList (97% of its classes used) — unused: hz-convo--unread
- Countdown (67% of its classes used) — files named in its README not found: src/ui/countdown.tsx — unused: hz-countdown hz-countdown--block hz-countdown--over hz-countdown--soon hz-countdown__date hz-countdown__value hz-countdown__when hz-divider hz-divider--subtle
- CtaBand (93% of its classes used) — unused: hz-cta--stacked
- DataTable (95% of its classes used) — unused: hz-owner--compact hz-table-wrap--scroll
- DecisionDesk (99% of its classes used) — files named in its README not found: src/ops/decision-desk.tsx — unused: hz-age--overdue
- DeliveryCodeCard (68% of its classes used) — unused: hz-handover hz-handover__code hz-handover__code--void hz-handover__digits hz-handover__entry hz-handover__fact hz-handover__facts hz-handover__head hz-handover__lead hz-handover__title
- Divider (80% of its classes used) — files named in its README not found: src/ui/divider.tsx — unused: hz-divider hz-divider--label hz-divider--label-start hz-divider--subtle hz-divider--vertical hz-divider__label
- DocumentPreview (69% of its classes used) — unused: hz-doc__status--error hz-docview hz-docview__head hz-docview__meta hz-docview__pager hz-docview__thumb hz-docview__thumb-img hz-docview__thumbs hz-docview__title
- Drawer (98% of its classes used) — unused: hz-check__desc
- FeaturedList (94% of its classes used) — unused: hz-featured
- FileField (96% of its classes used) — unused: hz-file--disabled
- FilterBar (91% of its classes used) — unused: hz-filterbar--bleed hz-filterbar__btn hz-filterbar__end hz-input--sm hz-select--sm
- GroupedNav (97% of its classes used) — unused: hz-menu--static
- Hero (78% of its classes used) — unused: hz-featured hz-story hz-story--compact hz-story-row hz-story__body hz-story__foot hz-story__summary hz-story__title
- IconButton (93% of its classes used) — unused: hz-icon-btn--lg
- ImageUploader (59% of its classes used) — files named in its README not found: src/ui/image-uploader.tsx — unused: hz-crop hz-crop-frame hz-crop-frame__caption hz-crop-frame__row hz-crop-frames hz-crop__focus hz-crop__hint hz-image-up hz-image-up__actions hz-image-up__busy hz-image-up__preview hz-image-up__preview--avatar hz-image-up__preview--cover hz-image-up__preview--disabled hz-image-up__preview--invalid hz-image-up__preview--square
- JalaliDateField (58% of its classes used) — unused: hz-calendar hz-calendar__day hz-calendar__day--out hz-calendar__day--range hz-calendar__foot hz-calendar__foot-note hz-calendar__grid hz-calendar__head hz-calendar__row hz-calendar__title hz-calendar__wd hz-date-approx hz-date-pair hz-date-pair__sep hz-date-time hz-input-wrap--action hz-input-wrap__action
- KeyValueList (100% of its classes used) — files named in its README not found: src/ui/key-value-list.tsx
- LocationField (53% of its classes used) — unused: hz-location hz-location__actions hz-location__bar hz-location__coords hz-location__map hz-location__row hz-map hz-map--wide hz-map__area hz-map__attrib hz-map__canvas hz-map__pin hz-map__pin--place hz-map__pin-head hz-map__road hz-map__road-casing hz-map__state hz-map__state-body hz-map__state-title hz-map__street hz-map__water
- MergeTool (67% of its classes used) — files named in its README not found: src/admin/merge-tool.tsx — unused: hz-alert--success hz-merge hz-merge--stacked hz-merge__field hz-merge__field-note hz-merge__fields hz-merge__main hz-merge__meta hz-merge__name hz-merge__pending hz-merge__record hz-merge__record--discarded hz-merge__record--kept hz-merge__records hz-merge__result hz-merge__role hz-merge__row hz-merge__row--error hz-merge__row--head hz-merge__same hz-merge__src hz-merge__value hz-merge__value--empty hz-tabs hz-tabs--sm hz-tabs__tab
- MessageBubble (71% of its classes used) — unused: hz-appt hz-appt__head hz-appt__item hz-appt__list hz-appt__title hz-msg--failed hz-msg--sending hz-msg__bubble--media hz-msg__caption hz-msg__failed hz-msg__file hz-msg__file-body hz-msg__file-icon hz-msg__file-meta hz-msg__file-name hz-msg__retry
- MessageComposer (91% of its classes used) — unused: hz-attach-chip--error hz-attach-chip__size
- Modal (98% of its classes used) — unused: hz-modal__lead
- MoneyField (93% of its classes used) — unused: hz-input--sm
- MultiFileUploader (52% of its classes used) — files named in its README not found: src/ui/multi-file-uploader.tsx — unused: hz-dropzone hz-dropzone--compact hz-dropzone--disabled hz-dropzone--invalid hz-dropzone--over hz-dropzone__hint hz-dropzone__icon hz-dropzone__title hz-upload hz-upload--doc hz-upload--error hz-upload-list hz-upload-list__head hz-upload__actions hz-upload__alt hz-upload__body hz-upload__file-icon hz-upload__head hz-upload__meta hz-upload__name
- NationalIdField (82% of its classes used) — files named in its README not found: src/ui/national-id-field.tsx — unused: hz-field__success hz-input--digits
- NotificationBell (77% of its classes used) — files named in its README not found: src/ui/notification-bell.tsx — unused: hz-bell hz-bell__panel hz-icon-btn__count hz-input--sm hz-notification-panel hz-notification-panel__foot hz-notification-panel__head hz-notification-panel__list hz-notification-panel__title hz-notifications--compact hz-topbar__search
- NotificationItem (82% of its classes used) — files named in its README not found: src/notifications/item.tsx — unused: hz-notification-panel hz-notification-panel__foot hz-notification-panel__head hz-notification-panel__list hz-notification-panel__title hz-notifications--compact
- OfferCard (97% of its classes used) — unused: hz-offer__meta
- OpsShell (99% of its classes used) — unused: hz-age--late
- OpsShellMobile (99% of its classes used) — unused: hz-age--late
- OpsShellTablet (98% of its classes used) — unused: hz-age--late
- OrderSummary (88% of its classes used) — files named in its README not found: src/shop/order-summary.tsx — unused: hz-summary__actions hz-summary__row--sub hz-summary__row--total
- OtpField (95% of its classes used) — unused: hz-otp-field__resend
- PageHeader (97% of its classes used) — unused: hz-age--late
- Pagination (93% of its classes used) — unused: hz-pagination__more
- PaymentResult (100% of its classes used) — files named in its README not found: src/billing/payment-result.tsx
- PaymentRow (98% of its classes used) — files named in its README not found: src/billing/payment-row.tsx — unused: hz-payment__action
- PedigreeTree (77% of its classes used) — unused: hz-ped--collapsed-parents hz-ped--g1 hz-ped--g2 hz-ped--g3 hz-ped__id
- PlaceMap (53% of its classes used) — unused: hz-map hz-map--fill hz-map--wide hz-map-split hz-map__area hz-map__attrib hz-map__canvas hz-map__card hz-map__controls hz-map__pin hz-map__pin--place hz-map__pin-head hz-map__road hz-map__road-casing hz-map__state hz-map__state-body hz-map__state-title hz-map__street hz-map__water hz-place hz-place-list hz-place__body hz-place__meta hz-place__name hz-place__num
- PopoverMenu (83% of its classes used) — files named in its README not found: src/ui/menu.tsx — unused: hz-menu--align-start hz-menu__action--destructive hz-menu__head hz-menu__head-name hz-menu__head-sub hz-menu__head-text hz-menu__hint
- PriceDisplay (72% of its classes used) — files named in its README not found: src/ui/price.tsx — unused: hz-price--discount hz-price--end hz-price--muted hz-price--sm hz-price--stack hz-price__note hz-price__old hz-price__prefix hz-price__row hz-price__save
- ProductCard (95% of its classes used) — unused: hz-price--muted
- PublicShell (98% of its classes used) — unused: hz-input--sm hz-topbar__search
- PublicShellMobile (98% of its classes used) — unused: hz-input--sm hz-topbar__search
- PublicShellTablet (98% of its classes used) — unused: hz-input--sm hz-topbar__search
- QuantityStepper (86% of its classes used) — files named in its README not found: src/shop/quantity-stepper.tsx — unused: hz-qty--invalid hz-qty-field__row hz-stock-note
- QueueTile (90% of its classes used) — files named in its README not found: src/ops/queue-tile.tsx — unused: hz-age--late hz-age--overdue
- Radio (94% of its classes used) — unused: hz-choice-group--cards
- RadioCard (74% of its classes used) — files named in its README not found: src/ui/radio-card.tsx — unused: hz-choice-group--cards hz-option__icon hz-option__lock hz-option__price hz-option__price--unset
- Rating (63% of its classes used) — files named in its README not found: src/shop/rating.tsx — unused: hz-person hz-person__name hz-person__sub hz-person__text hz-rating-input hz-rating-input__off hz-rating-input__on hz-rating-input__opt hz-rating-input__row hz-rating-input__stars hz-rating-input__value hz-rating-input__value--empty
- ReasonField (92% of its classes used) — files named in its README not found: src/ops/reason-field.tsx — unused: hz-reason__add hz-textarea--internal
- RelatedColumn (97% of its classes used) — unused: hz-related__skeleton
- ReportCard (66% of its classes used) — files named in its README not found: src/ops/report-card.tsx — unused: hz-age--late hz-report hz-report__excerpt hz-report__foot hz-report__head hz-report__kind hz-report__note hz-report__outcome hz-report__reason hz-report__stat hz-report__stats hz-report__target hz-report__target-meta
- RequestCard (93% of its classes used) — unused: hz-age--overdue hz-request__note
- RoleSwitcher (96% of its classes used) — unused: hz-menu__hint
- SearchField (57% of its classes used) — unused: hz-input-wrap--action hz-input-wrap__action hz-listbox hz-listbox__empty hz-listbox__footer hz-listbox__group hz-listbox__icon hz-listbox__list hz-listbox__meta hz-listbox__option hz-listbox__primary hz-listbox__text
- SelectField (91% of its classes used) — unused: hz-input--sm
- SellerCard (89% of its classes used) — unused: hz-seller__fee hz-seller__shipping
- SensitiveConfirm (82% of its classes used) — unused: hz-alert--neutral hz-confirm hz-confirm__code hz-confirm__list hz-confirm__mark hz-confirm__match hz-confirm__title hz-modal__lead
- SettingsPanel (99% of its classes used) — files named in its README not found: src/admin/settings-panel.tsx — unused: hz-input--sm
- SiteFooter (77% of its classes used) — files named in its README not found: src/public/site-footer.tsx — unused: hz-site-footer--stacked hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- SiteShell (97% of its classes used) — unused: hz-grid hz-site-footer__trust
- SiteShellMobile (97% of its classes used) — unused: hz-grid hz-site-footer__trust
- SiteShellTablet (97% of its classes used) — unused: hz-grid hz-site-footer__trust
- SortMenu (97% of its classes used) — unused: hz-menu__hint
- StatTile (95% of its classes used) — files named in its README not found: src/ops/stat-tile.tsx — unused: hz-stat-tile__delta
- Stepper (83% of its classes used) — unused: hz-step__label hz-step__sub hz-stepper--vertical
- StickyActionBar (94% of its classes used) — unused: hz-has-sticky-bar
- StockBadge (75% of its classes used) — files named in its README not found: src/ui/stock-badge.tsx — unused: hz-stock--action hz-stock--reserved hz-stock-detail hz-stock-note
- SubOrderCard (79% of its classes used) — files named in its README not found: src/shop/sub-order-card.tsx — unused: hz-order-head hz-order-head__meta hz-order-head__title hz-suborder__step hz-suborder__step--done hz-suborder__steps hz-suborder__track hz-suborder__track-label hz-suborders
- Switch (62% of its classes used) — unused: hz-switch-row hz-switch-row__desc hz-switch-row__label hz-switch-row__status hz-switch-row__text
- Tabs (80% of its classes used) — files named in its README not found: src/ui/tabs.tsx — unused: hz-tabs hz-tabs--bleed hz-tabs--fit hz-tabs--sm hz-tabs__panel hz-tabs__tab
- TextAreaField (92% of its classes used) — unused: hz-field__counter--over
- TextField (85% of its classes used) — unused: hz-input--sm hz-input-wrap--action hz-input-wrap__action
- TextStyles (93% of its classes used) — unused: hz-numeric
- Toast (59% of its classes used) — files named in its README not found: src/ui/toast.tsx — unused: hz-toast hz-toast--error hz-toast--success hz-toast-region hz-toast-region--above-bar hz-toast__actions hz-toast__text
- Tooltip (80% of its classes used) — files named in its README not found: src/ui/tooltip.tsx — unused: hz-tooltip hz-tooltip--below hz-tooltip--open hz-tooltip--start hz-tooltip-anchor
- UnsetValue (97% of its classes used) — files named in its README not found: src/ui/format.tsx — unused: hz-unset__note
- VariantPicker (96% of its classes used) — files named in its README not found: src/ui/variant-picker.tsx — unused: hz-variant-picker--compact
- VerificationResult (85% of its classes used) — unused: hz-verify--loading hz-verify--revoked hz-verify__actions hz-verify__hints hz-verify__private

## REVIEW · Key screens

Classes used by the key-screen markup that appear nowhere in the app — each is a part of the designed page that may be missing.

- K1 / @1440 (K01-home-D.html): hz-grid hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- K1 / @390 (K01-home-M.html): hz-grid hz-site-footer--stacked hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- K2 /dashboard @1440 (K02-dashboard-D.html): hz-avatar--lg hz-input--sm hz-payment__action hz-topbar__search
- K2 /dashboard @390 (K02-dashboard-M.html): hz-avatar--lg hz-input--sm hz-topbar__search
- K2 /dashboard @390 (K02-dashboard-new-M.html): hz-avatar--empty hz-avatar--lg hz-input--sm hz-topbar__search
- K2 /dashboard @1440 (K02-dashboard-ops-D.html): hz-avatar--lg hz-input--sm hz-topbar__search
- K3 /assoc/kyc/[id] @1440 (K03-kyc-desk-D.html): hz-age--late
- K3 /assoc/kyc/[id] @390 (K03-kyc-desk-M.html): hz-age--late
- K4 /articles/[slug] @1440 (K04-article-D.html): hz-figure__caption hz-figure__credit hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- K4 /articles/[slug] @390 (K04-article-M.html): hz-figure__caption hz-figure__credit hz-site-footer--stacked hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- K5 /veterinarians @1440 (K05-vets-D.html): hz-filterbar__end hz-grid hz-select--sm hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- K5 /veterinarians @390 (K05-vets-M.html): hz-filterbar--bleed hz-filterbar__btn hz-pagination__more hz-site-footer--stacked hz-site-footer__contact-item hz-site-footer__contact-list hz-site-footer__trust hz-site-footer__trust-note hz-site-footer__trust-row
- K6 /animals-market/[id] @1440 (K06-listing-D.html): hz-countdown hz-countdown__date hz-countdown__value hz-divider hz-divider--subtle hz-grid hz-price__note hz-seller__shipping hz-site-footer__trust
- K6 /animals-market/[id] @390 (K06-listing-M.html): hz-countdown hz-countdown__date hz-countdown__value hz-grid hz-has-sticky-bar hz-price__note hz-seller__shipping hz-site-footer__trust
- K7 /shop/[slug] @1440 (K07-product-D.html): hz-accordion__icon hz-divider hz-divider--subtle hz-grid hz-person hz-person__name hz-person__sub hz-person__text hz-price--muted hz-seller__fee hz-seller__shipping hz-site-footer__trust
- K7 /shop/[slug] @390 (K07-product-M.html): hz-accordion__icon hz-divider hz-divider--subtle hz-grid hz-has-sticky-bar hz-person hz-person__name hz-person__sub hz-person__text hz-price--muted hz-qty-field__row hz-seller__fee hz-seller__shipping hz-site-footer__trust hz-variant-picker--compact
- K8 /login @1440 (K08-login-D.html): hz-countdown__value hz-otp-field__resend
- K8 /login @390 (K08-login-M.html): hz-countdown__value hz-otp-field__resend
- K9 /animals/[id] @1440 (K09-animal-D.html): hz-input--sm hz-topbar__search
- K9 /animals/[id] @390 (K09-animal-M.html): hz-has-sticky-bar hz-input--sm hz-topbar__search
- K10 /animals/new @1440 (K10-animal-new-D.html): hz-check__desc hz-divider hz-divider--subtle hz-grid hz-input--sm hz-topbar__search
- K10 /animals/new @390 (K10-animal-new-M.html): hz-check__desc hz-has-sticky-bar
- K11 /requests/[id] @1440 (K11-request-D.html): hz-countdown hz-countdown--over hz-countdown__date hz-countdown__value hz-grid hz-input--sm hz-topbar__search hz-upload hz-upload--doc hz-upload--error hz-upload-list hz-upload__actions hz-upload__body hz-upload__file-icon hz-upload__head hz-upload__meta hz-upload__name
- K11 /requests/[id] @390 (K11-request-M.html): hz-countdown hz-countdown--over hz-countdown__date hz-countdown__value hz-has-sticky-bar hz-upload hz-upload--doc hz-upload--error hz-upload-list hz-upload__actions hz-upload__body hz-upload__file-icon hz-upload__head hz-upload__meta hz-upload__name
- K12 /vet/check-in @1440 (K12-vet-checkin-D.html): hz-countdown hz-countdown__date hz-countdown__value hz-grid hz-input--digits hz-input--sm hz-person hz-person__name hz-person__sub hz-person__text hz-request__note hz-topbar__search
- K12 /vet/check-in @390 (K12-vet-checkin-M.html): hz-has-sticky-bar hz-input--digits hz-person hz-person__name hz-person__sub hz-person__text hz-request__note hz-segmented--block
- K13 /assoc @1440 (K13-assoc-home-D.html): hz-age--late hz-age--overdue
- K13 /assoc @390 (K13-assoc-home-M.html): hz-age--late hz-age--overdue
- K14 /market/listings @1440 (K14-market-listings-D.html): hz-age--late hz-avatar--empty hz-filterbar__btn hz-filterbar__end hz-input--sm hz-price--sm hz-queue__title
- K14 /market/listings @390 (K14-market-listings-M.html): hz-age--late hz-bulkbar--bottom hz-bulkbar__row hz-cardlist__body hz-cardlist__item--select hz-cardlist__item--selected hz-filterbar--bleed hz-filterbar__btn hz-pagination__more hz-price--sm hz-queue__title
- K15 /admin/settings @1440 (K15-settings-D.html): hz-input--sm
- K15 /admin/settings @390 (K15-settings-M.html): hz-accordion__heading hz-accordion__icon hz-accordion__meta
- K16 /content/reports/[id] @1440 (K16-content-report-D.html): hz-age--overdue hz-report hz-report__head hz-report__kind hz-report__note hz-report__reason hz-report__stat hz-report__stats hz-report__target hz-report__target-meta
- K16 /content/reports/[id] @390 (K16-content-report-M.html): hz-age--overdue hz-report hz-report__note hz-report__reason hz-report__stat hz-report__stats
- K17 /account/listings/[id]/requests @1440 (K17-listing-chat-D.html): hz-appt hz-appt__head hz-appt__item hz-appt__list hz-appt__title hz-convo--unread hz-input--sm hz-msg--failed hz-msg__bubble--media hz-msg__caption hz-msg__failed hz-msg__retry hz-offer__meta hz-topbar__search
- K17 /account/listings/[id]/requests @390 (K17-listing-chat-M.html): hz-appt hz-appt__head hz-appt__item hz-appt__list hz-appt__title hz-msg--failed hz-msg__bubble--media hz-msg__caption hz-msg__failed hz-msg__retry hz-offer__meta
- K18 /documents/pedigree/[id] @1440 (K18-pedigree-doc-D.html): hz-a4__qr-box hz-ped--collapsed-parents hz-ped--g1 hz-ped--g2 hz-ped--g3 hz-ped__id
- K18 /documents/pedigree/[id] @390 (K18-pedigree-doc-M.html): hz-a4__qr-box hz-ped__id
- K19 /genetics/samples @1440 (K19-genetics-samples-D.html): hz-age--late hz-age--overdue hz-filterbar__btn hz-filterbar__end hz-input--sm hz-queue__title
- K19 /genetics/samples @390 (K19-genetics-samples-M.html): hz-age--late hz-age--overdue hz-filterbar--bleed hz-filterbar__btn hz-toolrow

## OK · Stylesheets

bundle.css is identical to v1.0.4.

## OK · Stylesheets

tokens.css matches v1.0.4 (font URLs aside).

## OK · Tokens

137 tokens defined.

## OK · Fonts

11 IRANSansX woff2 files present and identical.

## OK · Brand

25 brand files present and identical (logo SVGs, app icon A, favicons, OG image).

## OK · Imagery

The seed imports the photos from demo-content/images-manifest.json (78 entries). Confirm in QA that all 78 appear on screen.

## OK · Status

81 keys with the approved labels.

## OK · Icons

All 128 approved icons available.

## OK · Evidence

Every key screen has an app screenshot next to its reference.

